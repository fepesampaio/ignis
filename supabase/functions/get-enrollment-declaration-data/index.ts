import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
});

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function addMonths(dateStr: string, months: number) {
  const baseDate = new Date(dateStr);

  if (Number.isNaN(baseDate.getTime())) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, now.getUTCDate()))
      .toISOString()
      .slice(0, 10);
  }

  return new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + months, baseDate.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function getLatestDate(dates: Array<string | null | undefined>) {
  return dates
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function descriptionMatchesCourse(description: string | null | undefined, terms: string[]) {
  if (!description || terms.length === 0) return false;

  const normalizedDescription = normalizeText(description);
  return terms.some((term) => normalizedDescription.includes(term));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Token de autenticação não fornecido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedBody = BodySchema.safeParse(await req.json());

    if (!parsedBody.success) {
      return new Response(JSON.stringify({ error: parsedBody.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, courseId, enrollmentId } = parsedBody.data;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", authData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [enrollmentRes, profileRes, courseRes, localPaymentsRes] = await Promise.all([
      supabase
        .from("enrollments")
        .select("id, user_id, course_id, enrolled_at, is_migrated")
        .eq("id", enrollmentId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("cpf")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("courses")
        .select("title, enrollment_display_name")
        .eq("id", courseId)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("due_date, asaas_payment_id")
        .eq("user_id", userId)
        .eq("course_id", courseId)
        .not("due_date", "is", null)
        .order("due_date", { ascending: false })
        .limit(100),
    ]);

    if (enrollmentRes.error || !enrollmentRes.data) {
      return new Response(JSON.stringify({ error: "Matrícula não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (courseRes.error || !courseRes.data) {
      return new Response(JSON.stringify({ error: "Curso não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const enrollment = enrollmentRes.data;

    if (enrollment.user_id !== userId || enrollment.course_id !== courseId) {
      return new Response(JSON.stringify({ error: "Dados da matrícula inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latestLocalDueDate = getLatestDate((localPaymentsRes.data ?? []).map((payment) => payment.due_date));

    let latestAsaasDueDate: string | null = null;
    const cpf = profileRes.data?.cpf?.replace(/\D/g, "") ?? "";
    const courseTerms = [courseRes.data.enrollment_display_name, courseRes.data.title]
      .filter((value): value is string => Boolean(value))
      .map(normalizeText);

    if ((!latestLocalDueDate || enrollment.is_migrated) && cpf && asaasApiKey) {
      const customerSearchResponse = await fetch(`https://api.asaas.com/v3/customers?cpfCnpj=${cpf}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          access_token: asaasApiKey,
        },
      });

      if (customerSearchResponse.ok) {
        const customerData = await customerSearchResponse.json();
        const asaasPayments: Array<{ dueDate?: string; description?: string | null }> = [];

        for (const customer of customerData.data ?? []) {
          const paymentsResponse = await fetch(`https://api.asaas.com/v3/payments?customer=${customer.id}&limit=100`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              access_token: asaasApiKey,
            },
          });

          if (!paymentsResponse.ok) continue;

          const paymentsData = await paymentsResponse.json();
          asaasPayments.push(...(paymentsData.data ?? []));
        }

        const matchingDueDates = asaasPayments
          .filter((payment) => descriptionMatchesCourse(payment.description, courseTerms))
          .map((payment) => payment.dueDate);

        latestAsaasDueDate = getLatestDate(
          matchingDueDates.length > 0 ? matchingDueDates : asaasPayments.map((payment) => payment.dueDate),
        );
      }
    }

    const fallbackDueDate = addMonths(enrollment.enrolled_at, 6);
    const resolvedDueDate = latestLocalDueDate ?? latestAsaasDueDate ?? fallbackDueDate;

    return new Response(
      JSON.stringify({
        lastPaymentDueDate: resolvedDueDate,
        source: latestLocalDueDate ? "payments" : latestAsaasDueDate ? "asaas" : "fallback",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("get-enrollment-declaration-data error", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});