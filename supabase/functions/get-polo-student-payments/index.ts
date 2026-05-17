import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY")!;

    // Pagination & filter params
    let page = 1;
    let pageSize = 5;
    let search = "";
    let statusFilter = "all";
    try {
      if (req.method !== "GET") {
        const body = await req.json().catch(() => ({}));
        page = Math.max(1, Number(body?.page) || 1);
        pageSize = Math.max(1, Math.min(50, Number(body?.pageSize) || 5));
        search = String(body?.search || "").toLowerCase().trim();
        statusFilter = String(body?.status || "all");
      }
    } catch (_) { /* ignore */ }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token não fornecido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

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

    // Fetch ALL enrollments for this polo (lightweight) — needed to compute global summary
    const { data: allEnrollments, error: enrollmentError } = await supabaseClient
      .from("enrollments")
      .select(`
        id,
        user_id,
        course_id,
        enrolled_at,
        contract_status,
        payment_status,
        access_blocked,
        block_reason,
        courses:course_id(id, title, category)
      `)
      .eq("polo_id", polo.id)
      .order("enrolled_at", { ascending: false });

    if (enrollmentError) {
      console.error("Error fetching enrollments:", enrollmentError);
      throw enrollmentError;
    }

    const enrollments = allEnrollments || [];

    const userIds = [...new Set(enrollments.map(e => e.user_id))];

    // Fetch all profiles once
    const { data: profiles } = await supabaseClient
      .from("profiles")
      .select("user_id, full_name, email, phone, whatsapp")
      .in("user_id", userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const profilesMap = new Map((profiles || []).map(p => [p.user_id, p]));

    // Fetch ALL payments for the polo enrollments in ONE query (DB-only data, used for summary + filtering)
    const courseIds = [...new Set(enrollments.map(e => e.course_id))];
    const { data: allPayments } = await supabaseClient
      .from("payments")
      .select("id, user_id, course_id, amount, status, due_date, paid_at, installment_number, total_installments, payment_method, asaas_payment_id")
      .in("user_id", userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])
      .in("course_id", courseIds.length > 0 ? courseIds : ['00000000-0000-0000-0000-000000000000']);

    // Group payments by enrollment (user+course)
    const paymentsByEnrollment = new Map<string, typeof allPayments>();
    for (const p of (allPayments || [])) {
      const key = `${p.user_id}__${p.course_id}`;
      const arr = paymentsByEnrollment.get(key) || [];
      arr.push(p);
      paymentsByEnrollment.set(key, arr);
    }

    // Build a lightweight "student summary" per enrollment using DB-only payment status
    type StudentLite = {
      enrollment: typeof enrollments[number];
      profile: ReturnType<typeof profilesMap.get>;
      paid_count: number;
      pending_count: number;
      overdue_count: number;
      total_paid: number;
      total_pending: number;
      total_overdue: number;
      total_installments: number;
      payments: NonNullable<typeof allPayments>;
    };

    const studentLites: StudentLite[] = enrollments.map((enrollment) => {
      const key = `${enrollment.user_id}__${enrollment.course_id}`;
      const pays = (paymentsByEnrollment.get(key) || []).slice().sort(
        (a, b) => (a.installment_number || 0) - (b.installment_number || 0)
      );
      const totalPaid = pays.filter(p => p.status === 'RECEIVED' || p.status === 'CONFIRMED').reduce((s, p) => s + Number(p.amount), 0);
      const totalPending = pays.filter(p => p.status === 'PENDING').reduce((s, p) => s + Number(p.amount), 0);
      const totalOverdue = pays.filter(p => p.status === 'OVERDUE').reduce((s, p) => s + Number(p.amount), 0);
      return {
        enrollment,
        profile: profilesMap.get(enrollment.user_id),
        paid_count: pays.filter(p => p.status === 'RECEIVED' || p.status === 'CONFIRMED').length,
        pending_count: pays.filter(p => p.status === 'PENDING').length,
        overdue_count: pays.filter(p => p.status === 'OVERDUE').length,
        total_paid: totalPaid,
        total_pending: totalPending,
        total_overdue: totalOverdue,
        total_installments: pays.length,
        payments: pays,
      };
    });

    // Global summary across ALL students
    const globalSummary = {
      total_students: studentLites.length,
      students_with_overdue: studentLites.filter(s => s.overdue_count > 0).length,
      students_up_to_date: studentLites.filter(s => s.overdue_count === 0 && s.paid_count > 0).length,
      students_pending_first: studentLites.filter(s => s.paid_count === 0).length,
      total_collected: studentLites.reduce((s, x) => s + x.total_paid, 0),
      total_pending: studentLites.reduce((s, x) => s + x.total_pending, 0),
      total_overdue: studentLites.reduce((s, x) => s + x.total_overdue, 0),
    };

    // Apply filters/search
    const filtered = studentLites.filter((s) => {
      if (search) {
        const name = (s.profile?.full_name || "").toLowerCase();
        const email = (s.profile?.email || "").toLowerCase();
        const coursesData = s.enrollment.courses;
        const course = Array.isArray(coursesData) ? coursesData[0] : coursesData;
        const courseTitle = (course?.title || "").toLowerCase();
        if (!name.includes(search) && !email.includes(search) && !courseTitle.includes(search)) return false;
      }
      if (statusFilter !== "all") {
        if (statusFilter === "overdue" && s.overdue_count === 0) return false;
        if (statusFilter === "uptodate" && !(s.overdue_count === 0 && s.paid_count > 0)) return false;
        if (statusFilter === "pending" && s.paid_count !== 0) return false;
      }
      return true;
    });

    const totalFiltered = filtered.length;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    // For the page slice, enrich payments with Asaas data
    const studentPayments = await Promise.all(slice.map(async (s) => {
      const coursesData = s.enrollment.courses;
      const course = Array.isArray(coursesData) ? coursesData[0] : coursesData;

      const enrichedPayments = await Promise.all(s.payments.map(async (payment) => {
        let asaasData: any = null;
        if (payment.asaas_payment_id) {
          try {
            const asaasResponse = await fetch(
              `https://sandbox.asaas.com/api/v3/payments/${payment.asaas_payment_id}`,
              { headers: { "access_token": asaasApiKey } }
            );
            if (asaasResponse.ok) asaasData = await asaasResponse.json();
          } catch (err) {
            console.error("Error fetching Asaas payment:", err);
          }
        }
        return {
          id: payment.id,
          amount: payment.amount,
          status: asaasData?.status || payment.status,
          due_date: payment.due_date,
          paid_at: asaasData?.paymentDate || payment.paid_at,
          installment_number: payment.installment_number,
          total_installments: payment.total_installments,
          payment_method: asaasData?.billingType || payment.payment_method,
          asaas_payment_id: payment.asaas_payment_id,
          invoice_url: asaasData?.invoiceUrl || null,
          bank_slip_url: asaasData?.bankSlipUrl || null,
          pix_qrcode: asaasData?.pixQrCodeUrl || null,
        };
      }));

      // Recompute summary from enriched (Asaas-overridden) statuses for the page
      const totalPaid = enrichedPayments.filter(p => p.status === 'RECEIVED' || p.status === 'CONFIRMED').reduce((sum, p) => sum + Number(p.amount), 0);
      const totalPending = enrichedPayments.filter(p => p.status === 'PENDING').reduce((sum, p) => sum + Number(p.amount), 0);
      const totalOverdue = enrichedPayments.filter(p => p.status === 'OVERDUE').reduce((sum, p) => sum + Number(p.amount), 0);
      const paidCount = enrichedPayments.filter(p => p.status === 'RECEIVED' || p.status === 'CONFIRMED').length;
      const pendingCount = enrichedPayments.filter(p => p.status === 'PENDING').length;
      const overdueCount = enrichedPayments.filter(p => p.status === 'OVERDUE').length;

      return {
        enrollment_id: s.enrollment.id,
        student: {
          user_id: s.enrollment.user_id,
          name: s.profile?.full_name || "N/A",
          email: s.profile?.email || "N/A",
          phone: s.profile?.phone || null,
          whatsapp: s.profile?.whatsapp || null,
        },
        course: {
          id: course?.id || s.enrollment.course_id,
          title: course?.title || "N/A",
          category: course?.category || null,
        },
        enrollment_status: {
          contract_status: s.enrollment.contract_status,
          payment_status: s.enrollment.payment_status,
          access_blocked: s.enrollment.access_blocked,
          block_reason: s.enrollment.block_reason,
        },
        summary: {
          total_installments: enrichedPayments.length,
          paid_count: paidCount,
          pending_count: pendingCount,
          overdue_count: overdueCount,
          total_paid: totalPaid,
          total_pending: totalPending,
          total_overdue: totalOverdue,
          total_amount: totalPaid + totalPending + totalOverdue,
        },
        payments: enrichedPayments,
        enrolled_at: s.enrollment.enrolled_at,
      };
    }));

    return new Response(
      JSON.stringify({
        polo: {
          id: polo.id,
          name: polo.name,
          city: polo.city,
          state: polo.state,
        },
        summary: globalSummary,
        students: studentPayments,
        pagination: {
          page,
          pageSize,
          total: totalFiltered,
        },
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
