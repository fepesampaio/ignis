import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
}

// Verify webhook access token from Asaas
function verifyAsaasWebhookToken(req: Request, expectedToken: string): boolean {
  // Asaas sends the webhook access token in the 'asaas-access-token' header
  const providedToken = req.headers.get('asaas-access-token') || req.headers.get('Asaas-Access-Token');
  
  if (!providedToken) {
    console.error("Missing asaas-access-token header");
    return false;
  }
  
  return providedToken === expectedToken;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const webhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get raw body first
    const rawBody = await req.text()
    
    // Log request headers for debugging
    console.log("Request headers:", JSON.stringify(Object.fromEntries(req.headers.entries())))

    // Verify webhook token if configured
    if (webhookToken) {
      const isValid = verifyAsaasWebhookToken(req, webhookToken)
      
      if (!isValid) {
        console.error("Invalid or missing webhook token - blocking request")
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      console.log("Webhook token verified successfully")
    } else {
      console.warn("ASAAS_WEBHOOK_TOKEN not configured - webhook verification disabled")
    }

    const payload = JSON.parse(rawBody)
    console.log('Asaas webhook received:', JSON.stringify(payload, null, 2))

    const { event, payment } = payload

    if (!payment || !payment.id) {
      console.log('No payment data in webhook')
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const asaasPaymentId = payment.id

    // Find the payment in our database
    const { data: existingPayment, error: findError } = await supabase
      .from('payments')
      .select('*, enrollments!inner(id, user_id, course_id)')
      .eq('asaas_payment_id', asaasPaymentId)
      .single()

    if (findError || !existingPayment) {
      console.log('Payment not found in database:', asaasPaymentId)
      return new Response(JSON.stringify({ success: true, message: 'Payment not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Found payment:', existingPayment.id)

    let newStatus = existingPayment.status
    let paidAt = existingPayment.paid_at

    // Map Asaas events to our status
    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
        newStatus = 'CONFIRMED'
        paidAt = new Date().toISOString()
        console.log('Payment confirmed/received')
        break

      case 'PAYMENT_OVERDUE':
        newStatus = 'OVERDUE'
        console.log('Payment overdue')
        break

      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
        newStatus = 'CANCELLED'
        console.log('Payment cancelled/refunded')
        break

      case 'PAYMENT_RESTORED':
        newStatus = 'PENDING'
        console.log('Payment restored')
        break

      case 'PAYMENT_UPDATED':
        // Update due date if changed
        if (payment.dueDate) {
          await supabase
            .from('payments')
            .update({ due_date: payment.dueDate })
            .eq('id', existingPayment.id)
        }
        console.log('Payment updated')
        break

      default:
        console.log('Unhandled event:', event)
    }

    // Update payment status
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: newStatus,
        paid_at: paidAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingPayment.id)

    if (updateError) {
      console.error('Error updating payment:', updateError)
      throw updateError
    }

    console.log('Payment status updated to:', newStatus)

    // Check if we need to update enrollment access
    const userId = existingPayment.enrollments?.user_id
    const courseId = existingPayment.enrollments?.course_id

    if (userId && courseId) {
      // Check for overdue payments for this enrollment
      const { data: overduePayments } = await supabase
        .from('payments')
        .select('id')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .eq('status', 'OVERDUE')

      const hasOverduePayments = overduePayments && overduePayments.length > 0

      // Update enrollment access status
      const { error: enrollmentError } = await supabase
        .from('enrollments')
        .update({
          access_blocked: hasOverduePayments,
          payment_status: hasOverduePayments ? 'overdue' : 'active',
          block_reason: hasOverduePayments ? 'Pagamento em atraso' : null,
        })
        .eq('user_id', userId)
        .eq('course_id', courseId)

      if (enrollmentError) {
        console.error('Error updating enrollment:', enrollmentError)
      } else {
        console.log('Enrollment access updated, blocked:', hasOverduePayments)
      }

      // Create notification for the student
      if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Pagamento Confirmado',
          message: `Seu pagamento foi confirmado com sucesso! ${existingPayment.installment_number ? `Parcela ${existingPayment.installment_number}/${existingPayment.total_installments}` : ''}`,
          type: 'payment',
          related_id: existingPayment.id,
          related_type: 'payment',
        })
      } else if (event === 'PAYMENT_OVERDUE') {
        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Pagamento em Atraso',
          message: 'Você possui um pagamento em atraso. Por favor, regularize sua situação para continuar acessando o curso.',
          type: 'payment',
          related_id: existingPayment.id,
          related_type: 'payment',
        })
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error processing Asaas webhook:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
