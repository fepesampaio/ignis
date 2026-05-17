import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Calculate split percentage based on course category
function getSplitPercentage(category: string | null): number {
  if (!category) return 0;
  
  const normalizedCategory = category.toLowerCase().trim();
  
  if (normalizedCategory === 'eja' || normalizedCategory === 'técnico') {
    return 40;
  }
  
  if (normalizedCategory === 'técnico por competência' || normalizedCategory === 'por competência') {
    return 35;
  }
  
  if (normalizedCategory === 'profissional') {
    return 50;
  }
  
  return 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse pagination params from body (POST) or query string (GET)
    let page = 1;
    let pageSize = 5;
    let search = "";
    let statusFilter = "all";
    let categoryFilter = "all";
    try {
      if (req.method !== "GET") {
        const body = await req.json().catch(() => ({}));
        page = Math.max(1, Number(body?.page) || 1);
        pageSize = Math.max(1, Math.min(50, Number(body?.pageSize) || 5));
        search = String(body?.search || "").toLowerCase().trim();
        statusFilter = String(body?.status || "all");
        categoryFilter = String(body?.category || "all");
      }
    } catch (_) { /* ignore */ }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY")!;
    
    // Get auth token from header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token não fornecido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get polo info for the user
    const { data: poloUser, error: poloUserError } = await supabaseClient
      .from("polo_users")
      .select("polo_id")
      .eq("user_id", user.id)
      .single();

    if (poloUserError || !poloUser) {
      return new Response(
        JSON.stringify({ error: "Usuário não está vinculado a um polo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get polo details
    const { data: polo, error: poloError } = await supabaseClient
      .from("polos")
      .select("*")
      .eq("id", poloUser.polo_id)
      .single();

    if (poloError || !polo) {
      return new Response(
        JSON.stringify({ error: "Polo não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get enrollments for this polo (without profile join - no FK exists)
    const { data: enrollments, error: enrollmentError } = await supabaseClient
      .from("enrollments")
      .select(`
        id,
        user_id,
        course_id,
        enrolled_at,
        contract_status,
        payment_status,
        courses:course_id(title, category)
      `)
      .eq("polo_id", polo.id)
      .order("enrolled_at", { ascending: false });

    if (enrollmentError) {
      console.error("Error fetching enrollments:", enrollmentError);
      throw enrollmentError;
    }

    // Get all unique user IDs and fetch profiles separately
    const userIds = [...new Set((enrollments || []).map(e => e.user_id))];
    const courseIds = [...new Set((enrollments || []).map(e => e.course_id))];

    // Fetch profiles separately
    const { data: profiles, error: profilesError } = await supabaseClient
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
    }

    // Create a map of profiles by user_id
    const profilesMap = new Map((profiles || []).map(p => [p.user_id, p]));

    const { data: payments, error: paymentsError } = await supabaseClient
      .from("payments")
      .select("*")
      .in("user_id", userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])
      .in("course_id", courseIds.length > 0 ? courseIds : ['00000000-0000-0000-0000-000000000000'])
      .order("due_date", { ascending: true });

    if (paymentsError) {
      console.error("Error fetching payments:", paymentsError);
      throw paymentsError;
    }

    // Build the FULL list of commission base records first (no Asaas calls yet)
    type BaseRecord = {
      payment_id: string;
      asaas_payment_id: string | null;
      student_name: string;
      student_email: string;
      course_title: string;
      course_category: string;
      payment_amount: number;
      split_percentage: number;
      commission_value: number;
      payment_status: string;
      payment_due_date: string;
      payment_paid_at: string | null;
      installment_number: number | null;
      total_installments: number | null;
    };

    const baseRecords: BaseRecord[] = [];
    let totalCommissionReceived = 0;
    let totalCommissionPending = 0;

    for (const payment of payments || []) {
      const enrollment = enrollments?.find(
        e => e.user_id === payment.user_id && e.course_id === payment.course_id
      );
      if (!enrollment) continue;

      const coursesData = enrollment.courses;
      const course = Array.isArray(coursesData) ? coursesData[0] : coursesData;
      const profile = profilesMap.get(enrollment.user_id);

      const courseTitle = course?.title || 'N/A';
      const courseCategory = course?.category || null;
      const studentName = profile?.full_name || 'N/A';
      const studentEmail = profile?.email || 'N/A';

      const splitPercentage = getSplitPercentage(courseCategory);
      const commissionValue = (payment.amount * splitPercentage) / 100;

      baseRecords.push({
        payment_id: payment.id,
        asaas_payment_id: payment.asaas_payment_id,
        student_name: studentName,
        student_email: studentEmail,
        course_title: courseTitle,
        course_category: courseCategory || "N/A",
        payment_amount: payment.amount,
        split_percentage: splitPercentage,
        commission_value: commissionValue,
        payment_status: payment.status,
        payment_due_date: payment.due_date,
        payment_paid_at: payment.paid_at,
        installment_number: payment.installment_number,
        total_installments: payment.total_installments,
      });

      if (payment.status === "RECEIVED" || payment.status === "CONFIRMED") {
        totalCommissionReceived += commissionValue;
      } else if (payment.status === "PENDING") {
        totalCommissionPending += commissionValue;
      }
    }

    // Summary across ALL records
    const categoryBreakdown = baseRecords.reduce((acc, c) => {
      const category = c.course_category || "Outros";
      if (!acc[category]) {
        acc[category] = { total: 0, received: 0, pending: 0, count: 0, splitPercentage: c.split_percentage };
      }
      acc[category].count++;
      acc[category].total += c.commission_value;
      if (c.payment_status === "RECEIVED" || c.payment_status === "CONFIRMED") {
        acc[category].received += c.commission_value;
      } else if (c.payment_status === "PENDING") {
        acc[category].pending += c.commission_value;
      }
      return acc;
    }, {} as Record<string, { total: number; received: number; pending: number; count: number; splitPercentage: number }>);

    // Apply filters/search
    const filtered = baseRecords.filter((c) => {
      if (search) {
        const haystack = `${c.student_name} ${c.course_title}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (statusFilter !== "all") {
        if (statusFilter === "received" && !(c.payment_status === "RECEIVED" || c.payment_status === "CONFIRMED")) return false;
        if (statusFilter === "pending" && c.payment_status !== "PENDING") return false;
        if (statusFilter === "overdue" && c.payment_status !== "OVERDUE") return false;
      }
      if (categoryFilter !== "all" && c.course_category !== categoryFilter) return false;
      return true;
    });

    // Slice page
    const totalFiltered = filtered.length;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    // Fetch Asaas split info ONLY for the page slice
    const commissions = await Promise.all(slice.map(async (r) => {
      let asaasSplitInfo = null;
      if (r.asaas_payment_id) {
        try {
          const splitResponse = await fetch(
            `https://sandbox.asaas.com/api/v3/payments/${r.asaas_payment_id}/splits`,
            { headers: { "access_token": asaasApiKey } }
          );
          if (splitResponse.ok) {
            const splitData = await splitResponse.json();
            const poloSplit = splitData.data?.find(
              (s: { walletId: string }) => s.walletId === polo.wallet_id
            );
            if (poloSplit) asaasSplitInfo = poloSplit;
          }
        } catch (splitError) {
          console.error("Error fetching split from Asaas:", splitError);
        }
      }
      return { ...r, asaas_split_info: asaasSplitInfo };
    }));

    // List of available categories (for filter dropdown)
    const availableCategories = [...new Set(baseRecords.map(r => r.course_category))].filter(Boolean);

    return new Response(
      JSON.stringify({
        polo: {
          id: polo.id,
          name: polo.name,
          city: polo.city,
          state: polo.state,
          wallet_id: polo.wallet_id,
        },
        summary: {
          total_commission_received: totalCommissionReceived,
          total_commission_pending: totalCommissionPending,
          total_commission: totalCommissionReceived + totalCommissionPending,
          total_payments: baseRecords.length,
          category_breakdown: categoryBreakdown,
        },
        commissions,
        pagination: {
          page,
          pageSize,
          total: totalFiltered,
        },
        available_categories: availableCategories,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
