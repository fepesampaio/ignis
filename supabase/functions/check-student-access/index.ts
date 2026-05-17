import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to check payment status in Asaas
async function checkAsaasPaymentStatus(asaasPaymentId: string, asaasApiKey: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.asaas.com/v3/payments/${asaasPaymentId}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'access_token': asaasApiKey,
      },
    });

    if (!response.ok) {
      console.error(`Asaas API error for ${asaasPaymentId}:`, response.status);
      return null;
    }

    const data = await response.json();
    console.log(`Asaas payment ${asaasPaymentId} status:`, data.status);
    return data.status; // PENDING, RECEIVED, CONFIRMED, OVERDUE, etc.
  } catch (error) {
    console.error(`Error checking Asaas payment ${asaasPaymentId}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          hasAccess: false, 
          blocked: true,
          reason: "Não autenticado" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ 
          hasAccess: false, 
          blocked: true,
          reason: "Sessão inválida" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check user role - admins and professors always have access
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role === "admin" || roleData?.role === "professor") {
      return new Response(
        JSON.stringify({ 
          hasAccess: true, 
          blocked: false,
          role: roleData.role 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For students, check enrollment status and payments
    const { data: enrollments, error: enrollmentError } = await supabase
      .from("enrollments")
      .select("*, courses(title)")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (enrollmentError) {
      console.error("Error fetching enrollments:", enrollmentError);
    }

    // If no active enrollments
    if (!enrollments || enrollments.length === 0) {
      return new Response(
        JSON.stringify({ 
          hasAccess: false, 
          blocked: true,
          reason: "Nenhuma matrícula ativa encontrada" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get today's date for comparison
    const today = new Date().toISOString().split('T')[0];

    // First check for payments already marked as OVERDUE in database
    const { data: overduePayments } = await supabase
      .from("payments")
      .select("*, courses(title)")
      .eq("user_id", user.id)
      .eq("status", "OVERDUE")
      .order("due_date", { ascending: true });

    // Also get PENDING payments with past due dates (potential overdue)
    const { data: pendingPaymentsWithPastDue } = await supabase
      .from("payments")
      .select("*, courses(title)")
      .eq("user_id", user.id)
      .eq("status", "PENDING")
      .lt("due_date", today)
      .order("due_date", { ascending: true });

    // If we have Asaas API key and pending payments with past due dates, check their status in Asaas
    const confirmedOverduePayments: typeof overduePayments = [...(overduePayments || [])];
    
    if (asaasApiKey && pendingPaymentsWithPastDue && pendingPaymentsWithPastDue.length > 0) {
      console.log(`Checking ${pendingPaymentsWithPastDue.length} pending payments in Asaas...`);
      
      for (const payment of pendingPaymentsWithPastDue) {
        if (payment.asaas_payment_id) {
          const asaasStatus = await checkAsaasPaymentStatus(payment.asaas_payment_id, asaasApiKey);
          
          if (asaasStatus === 'RECEIVED' || asaasStatus === 'CONFIRMED') {
            // Payment was paid! Update local database
            console.log(`Payment ${payment.id} was paid (${asaasStatus}), updating local DB...`);
            await supabase
              .from("payments")
              .update({ 
                status: 'CONFIRMED', 
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq("id", payment.id);
            
            // Don't add to overdue list
          } else if (asaasStatus === 'OVERDUE' || asaasStatus === 'PENDING') {
            // Still overdue or pending with past due date - add to overdue list
            console.log(`Payment ${payment.id} is overdue (Asaas status: ${asaasStatus})`);
            
            // Update local database if Asaas says OVERDUE
            if (asaasStatus === 'OVERDUE') {
              await supabase
                .from("payments")
                .update({ status: 'OVERDUE', updated_at: new Date().toISOString() })
                .eq("id", payment.id);
            }
            
            confirmedOverduePayments.push(payment);
          } else if (asaasStatus === null) {
            // API failed, use local data as fallback - treat as overdue since due date passed
            console.log(`Could not check payment ${payment.id} in Asaas, treating as overdue`);
            confirmedOverduePayments.push(payment);
          }
        } else {
          // No Asaas ID, treat as overdue based on due date
          console.log(`Payment ${payment.id} has no Asaas ID, treating as overdue`);
          confirmedOverduePayments.push(payment);
        }
      }
    } else if (!asaasApiKey && pendingPaymentsWithPastDue && pendingPaymentsWithPastDue.length > 0) {
      // No Asaas API key, use local data
      console.log('No Asaas API key configured, using local database status');
      confirmedOverduePayments.push(...pendingPaymentsWithPastDue);
    }

    // Deduplicate by payment ID
    const uniqueOverduePayments = confirmedOverduePayments.filter(
      (payment, index, self) => 
        index === self.findIndex((p) => p.id === payment.id)
    );

    if (uniqueOverduePayments.length > 0) {
      console.log(`User ${user.id} has ${uniqueOverduePayments.length} overdue payments`);
      
      // Update enrollments to reflect blocked status
      for (const payment of uniqueOverduePayments) {
        await supabase
          .from("enrollments")
          .update({
            access_blocked: true,
            payment_status: 'overdue',
            block_reason: 'Pagamento em atraso'
          })
          .eq("user_id", user.id)
          .eq("course_id", payment.course_id);
      }

      return new Response(
        JSON.stringify({ 
          hasAccess: false, 
          blocked: true,
          reason: "Você possui boletos em atraso. Regularize sua situação para ter acesso à plataforma.",
          paymentStatus: "overdue",
          overduePayments: uniqueOverduePayments.map(p => ({
            id: p.id,
            asaas_payment_id: p.asaas_payment_id,
            amount: p.amount,
            dueDate: p.due_date,
            courseName: (p.courses as { title: string } | null)?.title,
            installment: p.installment_number,
            totalInstallments: p.total_installments,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No overdue payments - ensure enrollments are unblocked (for payment-related blocks only)
    for (const enrollment of enrollments) {
      if (enrollment.access_blocked && enrollment.block_reason === 'Pagamento em atraso') {
        console.log(`Unblocking enrollment ${enrollment.id} - no overdue payments`);
        await supabase
          .from("enrollments")
          .update({
            access_blocked: false,
            payment_status: 'active',
            block_reason: null
          })
          .eq("id", enrollment.id);
      }
    }

    // Check for any blocked enrollment (non-payment reasons)
    const blockedEnrollment = enrollments.find(e => 
      e.access_blocked && e.block_reason !== 'Pagamento em atraso'
    );
    
    if (blockedEnrollment) {
      return new Response(
        JSON.stringify({ 
          hasAccess: false, 
          blocked: true,
          reason: blockedEnrollment.block_reason || "Acesso bloqueado",
          contractStatus: blockedEnrollment.contract_status,
          paymentStatus: blockedEnrollment.payment_status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for pending contract signature
    const pendingContract = enrollments.find(e => 
      e.contract_status === "pending" || e.contract_status === "sent"
    );

    if (pendingContract) {
      return new Response(
        JSON.stringify({ 
          hasAccess: false, 
          blocked: true,
          reason: pendingContract.contract_status === "pending" 
            ? "Aguardando envio do contrato"
            : "Aguardando assinatura do contrato",
          contractStatus: pendingContract.contract_status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All checks passed
    return new Response(
      JSON.stringify({ 
        hasAccess: true, 
        blocked: false,
        role: "aluno",
        enrollments: enrollments.length 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error checking access:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ 
        hasAccess: false, 
        blocked: true,
        reason: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
