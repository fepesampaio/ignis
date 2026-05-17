import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');

    if (!asaasApiKey) {
      console.error('ASAAS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Configuração do Asaas não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Token de autenticação não fornecido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('User authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching payments for user: ${user.id}`);

    // Get user's profile to get email and CPF
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name, cpf')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'Perfil do usuário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has any migrated enrollments
    const { data: migratedEnrollments } = await supabase
      .from('enrollments')
      .select('id, course_id, is_migrated, courses:course_id(id, title)')
      .eq('user_id', user.id)
      .eq('is_migrated', true);

    const hasMigratedEnrollments = migratedEnrollments && migratedEnrollments.length > 0;
    console.log(`User has migrated enrollments: ${hasMigratedEnrollments}, CPF: ${profile.cpf ? 'exists' : 'missing'}`);

    // Get payments from our database (for non-migrated enrollments)
    const { data: localPayments, error: paymentsError } = await supabase
      .from('payments')
      .select(`
        *,
        courses:course_id (
          id,
          title
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (paymentsError) {
      console.error('Error fetching local payments:', paymentsError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar pagamentos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For each payment with asaas_payment_id, fetch updated info from Asaas
    const enrichedPayments = await Promise.all(
      (localPayments || []).map(async (payment) => {
        if (payment.asaas_payment_id) {
          try {
            const asaasResponse = await fetch(
              `https://api.asaas.com/v3/payments/${payment.asaas_payment_id}`,
              {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'access_token': asaasApiKey,
                },
              }
            );

            if (asaasResponse.ok) {
              const asaasData = await asaasResponse.json();
              return {
                ...payment,
                asaas_status: asaasData.status,
                due_date: asaasData.dueDate,
                value: asaasData.value,
                billing_type: asaasData.billingType,
                invoice_url: asaasData.invoiceUrl,
                bank_slip_url: asaasData.bankSlipUrl,
                pix_qr_code: asaasData.pixQrCodeUrl,
                pix_copy_paste: asaasData.pixCopiaECola,
                description: asaasData.description,
                original_due_date: asaasData.originalDueDate,
                payment_date: asaasData.paymentDate,
                client_payment_date: asaasData.clientPaymentDate,
                installment_number: asaasData.installmentNumber,
                net_value: asaasData.netValue,
              };
            }
          } catch (error) {
            console.error(`Error fetching Asaas payment ${payment.asaas_payment_id}:`, error);
          }
        }
        return payment;
      })
    );

    // If user has migrated enrollments and has CPF, fetch payments from Asaas by CPF
    let migratedPayments: any[] = [];
    
    if (hasMigratedEnrollments && profile.cpf) {
      try {
        // Clean CPF (remove dots and dashes)
        const cleanCpf = profile.cpf.replace(/[.\-]/g, '');
        console.log(`Searching Asaas customer by CPF: ${cleanCpf}`);

        // First, find customer by CPF
        const customerSearchResponse = await fetch(
          `https://api.asaas.com/v3/customers?cpfCnpj=${cleanCpf}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'access_token': asaasApiKey,
            },
          }
        );

        if (customerSearchResponse.ok) {
          const customerData = await customerSearchResponse.json();
          console.log(`Found ${customerData.data?.length || 0} customers with CPF`);

          if (customerData.data && customerData.data.length > 0) {
            // Get payments for each customer found
            for (const customer of customerData.data) {
              console.log(`Fetching payments for customer: ${customer.id}`);
              
              const paymentsResponse = await fetch(
                `https://api.asaas.com/v3/payments?customer=${customer.id}&limit=100`,
                {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'access_token': asaasApiKey,
                  },
                }
              );

              if (paymentsResponse.ok) {
                const paymentsData = await paymentsResponse.json();
                console.log(`Found ${paymentsData.data?.length || 0} payments for customer ${customer.id}`);

                // Filter out payments that are already in local payments (to avoid duplicates)
                const localAsaasIds = new Set(
                  (localPayments || [])
                    .filter(p => p.asaas_payment_id)
                    .map(p => p.asaas_payment_id)
                );

                const newPayments = (paymentsData.data || [])
                  .filter((p: any) => !localAsaasIds.has(p.id))
                  .map((asaasPayment: any) => ({
                    id: `migrated-${asaasPayment.id}`,
                    amount: asaasPayment.value,
                    status: asaasPayment.status,
                    payment_method: asaasPayment.billingType,
                    created_at: asaasPayment.dateCreated,
                    paid_at: asaasPayment.paymentDate,
                    asaas_payment_id: asaasPayment.id,
                    installment_number: asaasPayment.installmentNumber,
                    total_installments: asaasPayment.installmentCount,
                    courses: null, // We don't have course mapping for migrated payments
                    asaas_status: asaasPayment.status,
                    due_date: asaasPayment.dueDate,
                    value: asaasPayment.value,
                    billing_type: asaasPayment.billingType,
                    invoice_url: asaasPayment.invoiceUrl,
                    bank_slip_url: asaasPayment.bankSlipUrl,
                    pix_qr_code: asaasPayment.pixQrCodeUrl,
                    pix_copy_paste: asaasPayment.pixCopiaECola,
                    description: asaasPayment.description,
                    original_due_date: asaasPayment.originalDueDate,
                    payment_date: asaasPayment.paymentDate,
                    client_payment_date: asaasPayment.clientPaymentDate,
                    net_value: asaasPayment.netValue,
                    is_migrated: true,
                  }));

                migratedPayments = [...migratedPayments, ...newPayments];
              }
            }
          }
        } else if (customerSearchResponse.status !== 404) {
          console.error('Error searching customer in Asaas:', await customerSearchResponse.text());
        }
      } catch (error) {
        console.error('Error fetching migrated payments from Asaas:', error);
      }
    }

    // Combine local and migrated payments
    const allPayments = [...enrichedPayments, ...migratedPayments];
    console.log(`Found ${enrichedPayments.length} local payments and ${migratedPayments.length} migrated payments`);

    return new Response(
      JSON.stringify({ 
        payments: allPayments,
        user_name: profile.full_name,
        user_email: profile.email,
        has_migrated_enrollments: hasMigratedEnrollments,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
