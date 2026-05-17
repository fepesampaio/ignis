import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Token de autenticação não fornecido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { asaas_payment_id, payment_method, card_data } = body;

    if (!asaas_payment_id) {
      return new Response(
        JSON.stringify({ error: 'ID do pagamento não fornecido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing payment ${asaas_payment_id} with method ${payment_method}`);

    // Get current payment info from Asaas
    const paymentInfoResponse = await fetch(
      `https://api.asaas.com/v3/payments/${asaas_payment_id}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'access_token': asaasApiKey,
        },
      }
    );

    if (!paymentInfoResponse.ok) {
      const errorData = await paymentInfoResponse.text();
      console.error('Error fetching payment info:', errorData);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar informações do pagamento' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paymentInfo = await paymentInfoResponse.json();

    // If payment method is PIX, get/generate PIX data
    if (payment_method === 'PIX') {
      // Get PIX QR Code
      const pixResponse = await fetch(
        `https://api.asaas.com/v3/payments/${asaas_payment_id}/pixQrCode`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'access_token': asaasApiKey,
          },
        }
      );

      if (pixResponse.ok) {
        const pixData = await pixResponse.json();
        return new Response(
          JSON.stringify({
            success: true,
            payment_method: 'PIX',
            pix_data: {
              encoded_image: pixData.encodedImage,
              payload: pixData.payload,
              expiration_date: pixData.expirationDate,
            },
            payment_info: paymentInfo,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.error('Error generating PIX:', await pixResponse.text());
        return new Response(
          JSON.stringify({ error: 'Erro ao gerar código PIX' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If payment method is CREDIT_CARD
    if (payment_method === 'CREDIT_CARD') {
      if (!card_data) {
        return new Response(
          JSON.stringify({ error: 'Dados do cartão não fornecidos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { holder_name, number, expiry_month, expiry_year, ccv, holder_info } = card_data;

      // Validate card data
      if (!holder_name || !number || !expiry_month || !expiry_year || !ccv) {
        return new Response(
          JSON.stringify({ error: 'Dados do cartão incompletos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process credit card payment
      const payWithCardResponse = await fetch(
        `https://api.asaas.com/v3/payments/${asaas_payment_id}/payWithCreditCard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access_token': asaasApiKey,
          },
          body: JSON.stringify({
            creditCard: {
              holderName: holder_name,
              number: number.replace(/\s/g, ''),
              expiryMonth: expiry_month,
              expiryYear: expiry_year,
              ccv: ccv,
            },
            creditCardHolderInfo: holder_info ? {
              name: holder_info.name,
              email: holder_info.email,
              cpfCnpj: holder_info.cpf_cnpj?.replace(/\D/g, ''),
              postalCode: holder_info.postal_code?.replace(/\D/g, ''),
              addressNumber: holder_info.address_number,
              phone: holder_info.phone?.replace(/\D/g, ''),
            } : undefined,
          }),
        }
      );

      const paymentResult = await payWithCardResponse.json();

      if (!payWithCardResponse.ok) {
        console.error('Error processing card payment:', paymentResult);
        const errorMessage = paymentResult.errors?.[0]?.description || 'Erro ao processar pagamento com cartão';
        return new Response(
          JSON.stringify({ error: errorMessage }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update local payment status
      await supabase
        .from('payments')
        .update({
          status: paymentResult.status === 'CONFIRMED' ? 'paid' : 'pending',
          payment_method: 'credit_card',
          paid_at: paymentResult.status === 'CONFIRMED' ? new Date().toISOString() : null,
        })
        .eq('asaas_payment_id', asaas_payment_id);

      return new Response(
        JSON.stringify({
          success: true,
          payment_method: 'CREDIT_CARD',
          status: paymentResult.status,
          payment_info: paymentResult,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Método de pagamento inválido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
