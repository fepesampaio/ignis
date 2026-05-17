import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Calculate split percentage based on course category
function getSplitPercentage(category: string | null): number {
  if (!category) return 0;
  
  const normalizedCategory = category.toLowerCase().trim();
  
  // EJA and Technical courses: 40%
  if (normalizedCategory === 'eja' || normalizedCategory === 'técnico') {
    return 40;
  }
  
  // Technical by Competency: 35%
  if (normalizedCategory === 'técnico por competência' || normalizedCategory === 'por competência') {
    return 35;
  }
  
  // Professional courses: 50%
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get Asaas environment from system settings
    const { data: asaasEnvSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "asaas_environment")
      .single();
    
    // Parse the environment value
    let asaasEnv = "sandbox";
    if (asaasEnvSetting?.value) {
      const envValue = typeof asaasEnvSetting.value === 'string' 
        ? asaasEnvSetting.value.replace(/"/g, '') 
        : String(asaasEnvSetting.value).replace(/"/g, '');
      asaasEnv = envValue.toLowerCase().trim();
    }
    
    const asaasBaseUrl = asaasEnv === "production" 
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3";
    
    console.log("Asaas environment:", asaasEnv, "Base URL:", asaasBaseUrl);

    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    
    console.log("Assinafy webhook received:", JSON.stringify(payload));

    // Assinafy webhook events:
    // - document_ready: When all signers have signed (document is complete)
    // - signer_signed_document: When a single signer signs
    // - document_uploaded, document_prepared, etc.
    
    const event = payload.event;
    
    // Assinafy payload structure: document info is in payload.object
    const document = payload.object || payload.data?.document || payload.document;
    const documentId = document?.id;
    
    // Extract signer info - in Assinafy, signers are in object.assignment.signers
    let signerEmail: string | null = null;
    let signerName: string | null = null;
    const assignment = document?.assignment;
    const signers = assignment?.signers || document?.signers || [];
    
    if (signers.length > 0) {
      signerEmail = signers[0].email;
      signerName = signers[0].full_name;
      console.log("Extracted signer info:", { email: signerEmail, name: signerName });
    }

    console.log(`Event: ${event}, Document ID: ${documentId}`);

    // Only process document_ready event (all signers have signed)
    if (event !== "document_ready") {
      console.log(`Ignoring event ${event} - only processing document_ready`);
      return new Response(
        JSON.stringify({ success: true, message: `Event ${event} acknowledged but not processed` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find enrollment by document ID
    const { data: enrollment, error: enrollmentError } = await supabase
      .from("enrollments")
      .select(`
        *,
        polos:polo_id(id, name, wallet_id)
      `)
      .eq("contract_document_id", documentId)
      .single();

    if (enrollmentError || !enrollment) {
      console.error("Enrollment not found for document:", documentId, enrollmentError);
      return new Response(
        JSON.stringify({ success: true, message: "Webhook received, enrollment not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found enrollment:", enrollment.id);
    const paymentsAlreadyExistMessage = "Contract signed, payments already existed and access email was processed";

    // Get profile for student
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", enrollment.user_id)
      .single();

    // Get course details
    const { data: course } = await supabase
      .from("courses")
      .select("title, category, installment_price, installment_count")
      .eq("id", enrollment.course_id)
      .single();

    // Update enrollment status
    const { error: updateError } = await supabase
      .from("enrollments")
      .update({
        contract_status: "signed",
        contract_signed_at: new Date().toISOString(),
        payment_status: "pending",
      })
      .eq("id", enrollment.id);

    if (updateError) {
      console.error("Error updating enrollment:", updateError);
    }

    // Check if payments already exist
    const { data: existingPayments } = await supabase
      .from("payments")
      .select("id")
      .eq("user_id", enrollment.user_id)
      .eq("course_id", enrollment.course_id)
      .limit(1);
    const paymentsAlreadyExist = Boolean(existingPayments && existingPayments.length > 0);
    console.log("Payments already exist for this enrollment:", paymentsAlreadyExist);

    const { data: existingCompletionNotification } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", enrollment.user_id)
      .eq("related_id", enrollment.id)
      .eq("related_type", "enrollment")
      .eq("title", "Contrato Assinado!")
      .limit(1)
      .maybeSingle();
    const shouldSendWelcomeEmail = !existingCompletionNotification;

    // Payment values from course or defaults
    const monthlyValue = course?.installment_price || 150;
    const installments = course?.installment_count || 12;
    const dueDateDay = 10;

    // Get polo info and calculate split
    const polo = enrollment.polos as { id: string; name: string; wallet_id: string } | null;
    const splitPercentage = getSplitPercentage(course?.category);

    console.log("Polo info:", polo);
    console.log("Course category:", course?.category);
    console.log("Split percentage:", splitPercentage);

    // Create customer in Asaas
    let customerId = null;
    
    // Get student CPF from profile
    const studentCpf = profile?.cpf?.replace(/\D/g, '') || '';
    
    console.log("Student CPF available:", studentCpf ? "Yes" : "No");
    
    if (profile) {
      try {
        console.log("Looking for existing customer with email:", profile.email);
        
        // Check if customer exists by email
        const searchResponse = await fetch(
          `${asaasBaseUrl}/customers?email=${encodeURIComponent(profile.email)}`,
          {
            method: "GET",
            headers: {
              "accept": "application/json",
              "access_token": asaasApiKey,
            },
          }
        );
        
        let searchData: { data: Array<{ id: string }> } = { data: [] };
        if (searchResponse.ok) {
          searchData = await searchResponse.json();
          console.log("Search result:", JSON.stringify(searchData));
        } else if (searchResponse.status === 404) {
          console.log("Customer not found (404), will create new one");
        } else {
          const errorText = await searchResponse.text();
          console.error("Search customer error:", errorText);
        }
        
        if (searchData.data && searchData.data.length > 0) {
          customerId = searchData.data[0].id;
          console.log("Found existing customer:", customerId);
        } else {
          console.log("Creating new customer:", profile.full_name);
          
          // Build customer payload
          const customerPayload: Record<string, string> = {
            name: profile.full_name,
            email: profile.email,
          };
          
          if (studentCpf) {
            customerPayload.cpfCnpj = studentCpf;
          }
          
          const createCustomerResponse = await fetch(
            `${asaasBaseUrl}/customers`,
            {
              method: "POST",
              headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "access_token": asaasApiKey,
              },
              body: JSON.stringify(customerPayload),
            }
          );
          
          if (!createCustomerResponse.ok) {
            const errorText = await createCustomerResponse.text();
            console.error("Create customer error:", errorText);
            throw new Error(`Failed to create customer: ${createCustomerResponse.status}`);
          }
          
          const customerData = await createCustomerResponse.json();
          customerId = customerData.id;
          console.log("Created new customer:", customerId);
        }
      } catch (customerError) {
        console.error("Error managing customer:", customerError);
      }
    }

    // Create payment installments in Asaas
    if (customerId && !paymentsAlreadyExist) {
      const today = new Date();
      const paymentsToCreate = [];
      
      // Calculate first due date
      const currentDay = today.getDate();
      const startMonth = currentDay >= dueDateDay ? today.getMonth() + 1 : today.getMonth();
      
      for (let i = 0; i < installments; i++) {
        const dueDate = new Date(today.getFullYear(), startMonth + i, dueDateDay);
        const dueDateStr = dueDate.toISOString().split('T')[0];
        
        try {
          const paymentBody: Record<string, unknown> = {
            customer: customerId,
            billingType: "BOLETO",
            value: monthlyValue,
            dueDate: dueDateStr,
            description: `Parcela ${i + 1} de ${installments}. ${course?.title || 'Curso'}`,
            externalReference: `${enrollment.id}_${i + 1}`,
          };

          // Add split if polo exists
          if (polo && polo.wallet_id && splitPercentage > 0) {
            const splitValue = (monthlyValue * splitPercentage) / 100;
            
            paymentBody.split = [
              {
                walletId: polo.wallet_id,
                fixedValue: splitValue,
                description: `Comissão ${polo.name} - ${splitPercentage}%`
              }
            ];
            
            console.log(`Adding split for payment ${i + 1}: ${splitPercentage}% (R$ ${splitValue.toFixed(2)})`);
          }

          console.log(`Creating payment ${i + 1}/${installments}...`);
          
          const asaasResponse = await fetch(
            `${asaasBaseUrl}/payments`,
            {
              method: "POST",
              headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "access_token": asaasApiKey,
              },
              body: JSON.stringify(paymentBody),
            }
          );
          
          if (!asaasResponse.ok) {
            const errorText = await asaasResponse.text();
            console.error(`Payment ${i + 1} error:`, errorText);
            continue;
          }
          
          const asaasPayment = await asaasResponse.json();
          console.log(`Created payment ${i + 1}/${installments}:`, asaasPayment.id);
          
          paymentsToCreate.push({
            user_id: enrollment.user_id,
            course_id: enrollment.course_id,
            amount: monthlyValue,
            status: "PENDING",
            asaas_payment_id: asaasPayment.id,
            due_date: dueDateStr,
            installment_number: i + 1,
            total_installments: installments,
          });
        } catch (paymentError) {
          console.error(`Error creating payment ${i + 1}:`, paymentError);
        }
      }
      
      // Insert payments into database
      if (paymentsToCreate.length > 0) {
        const { error: insertError } = await supabase
          .from("payments")
          .insert(paymentsToCreate);
        
        if (insertError) {
          console.error("Error inserting payments:", insertError);
        } else {
          console.log(`Created ${paymentsToCreate.length} payments in database`);
        }
      }
      
      // Update enrollment to allow access
      await supabase
        .from("enrollments")
        .update({
          access_blocked: false,
          payment_status: "active",
          block_reason: null,
        })
        .eq("id", enrollment.id);
    }

    if (paymentsAlreadyExist) {
      await supabase
        .from("enrollments")
        .update({
          access_blocked: false,
          payment_status: "active",
          block_reason: null,
        })
        .eq("id", enrollment.id);
    }

    // Send welcome email with credentials
    if (shouldSendWelcomeEmail && resendApiKey && profile) {
      try {
        console.log("Sending welcome email after contract signature...");
        const resend = new Resend(resendApiKey);
        
        // Re-fetch profile to get the most up-to-date CPF
        const { data: latestProfile } = await supabase
          .from("profiles")
          .select("cpf")
          .eq("user_id", enrollment.user_id)
          .single();
        
        // Get CPF - prefer formatted version from profile
        let passwordCpf = latestProfile?.cpf || profile.cpf || '';
        
        // If CPF has formatting, keep it for display
        // If it's just numbers, format it
        if (passwordCpf && !passwordCpf.includes('.')) {
          const cleanCpf = passwordCpf.replace(/\D/g, '');
          if (cleanCpf.length === 11) {
            passwordCpf = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
          }
        }
        
        // Use CPF as password - only digits for actual login
        const passwordForLogin = passwordCpf.replace(/\D/g, '');
        
        console.log("Using CPF for password:", passwordCpf ? "Yes (formatted)" : "No CPF found");
        
        const loginUrl = "https://ead.institutoignis.com.br";
        
        const emailHtml = generateWelcomeEmailHtml({
          fullName: profile.full_name,
          email: profile.email,
          password: passwordForLogin, // CPF apenas com números (sem pontos e traços)
          courseName: course?.title || null,
          loginUrl,
        });

        const { error: emailError } = await resend.emails.send({
          from: "Instituto Ignis <contato@institutoignis.com.br>",
          to: [profile.email],
          subject: "Bem-vindo ao Instituto Ignis - Seus dados de acesso",
          html: emailHtml,
        });

        if (emailError) {
          console.error("Error sending welcome email:", emailError);
        } else {
          console.log("Welcome email sent successfully to:", profile.email);
        }
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
      }
    } else if (!shouldSendWelcomeEmail) {
      console.log("Welcome email already processed for this enrollment, skipping");
    }

    // Create notification for student
    if (!existingCompletionNotification) {
    await supabase
      .from("notifications")
      .insert({
        user_id: enrollment.user_id,
        title: "Contrato Assinado!",
        message: `Seu contrato para o curso ${course?.title || ''} foi assinado com sucesso. Os boletos foram gerados e você já pode acessar o curso. Confira seu email para os dados de acesso.`,
        type: "success",
        related_id: enrollment.id,
        related_type: "enrollment",
      });

    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: paymentsAlreadyExist ? paymentsAlreadyExistMessage : "Contract processed, payments created, welcome email sent",
        split_info: polo && splitPercentage > 0 ? {
          polo_name: polo.name,
          polo_wallet_id: polo.wallet_id,
          split_percentage: splitPercentage
        } : null
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error processing Assinafy webhook:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface EmailTemplateData {
  fullName: string;
  email: string;
  password: string;
  courseName: string | null;
  loginUrl: string;
}

function generateWelcomeEmailHtml(data: EmailTemplateData): string {
  const { fullName, email, password, loginUrl } = data;
  const currentYear = new Date().getFullYear();
  
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao Instituto Ignis</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 3px solid #1e5bb8;">
              <h1 style="margin: 0 0 8px; color: #1e5bb8; font-size: 28px; font-weight: 700;">
                Instituto Ignis
              </h1>
              <p style="margin: 0; color: #666; font-size: 14px; font-weight: 500;">
                De Educação Digital
              </p>
            </td>
          </tr>
          
          <!-- Congratulations Message -->
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center;">
              <h2 style="margin: 0 0 16px; color: #333; font-size: 22px; font-weight: 600;">
                Parabéns, ${fullName}! 🎉
              </h2>
              <p style="margin: 0; color: #555; font-size: 16px; line-height: 1.6;">
                Sua matrícula foi concluída com sucesso. Abaixo estão os dados de acesso ao portal do aluno. Guarde essas informações em segurança.
              </p>
            </td>
          </tr>
          
          <!-- Credentials Card -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <div style="background-color: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                
                <div style="margin-bottom: 16px;">
                  <p style="margin: 0 0 4px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                    Link de acesso:
                  </p>
                  <a href="${loginUrl}" style="color: #1e5bb8; font-size: 15px; text-decoration: none; word-break: break-all;">
                    ${loginUrl}
                  </a>
                </div>
                
                <div style="margin-bottom: 16px;">
                  <p style="margin: 0 0 4px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                    Usuário:
                  </p>
                  <p style="margin: 0; color: #333; font-size: 15px; word-break: break-all;">
                    ${email}
                  </p>
                </div>
                
                <div>
                  <p style="margin: 0 0 4px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                    Senha:
                  </p>
                  <p style="margin: 0; color: #333; font-size: 15px; font-family: monospace; background: #fff; padding: 6px 10px; border-radius: 4px; display: inline-block; border: 1px solid #ddd;">
                    ${password}
                  </p>
                </div>
              </div>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 40px 32px; text-align: center;">
              <a href="${loginUrl}" style="display: inline-block; background-color: #1e5bb8; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                Acessar minha conta
              </a>
            </td>
          </tr>
          
          <!-- WhatsApp Notice -->
          <tr>
            <td style="padding: 0 40px 32px; text-align: center;">
              <p style="margin: 0; color: #666; font-size: 14px; font-style: italic;">
                Você também receberá esta mensagem por WhatsApp.
              </p>
            </td>
          </tr>
          
          <!-- Support Section -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8f9fa; border-top: 1px solid #e0e0e0;">
              <h3 style="margin: 0 0 12px; color: #333; font-size: 16px; font-weight: 600; text-align: center;">
                Suporte e contato
              </h3>
              <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.6; text-align: center;">
                Se tiver dificuldades para acessar, entre em contato com nossa equipe:
              </p>
              <p style="margin: 12px 0 0; color: #333; font-size: 14px; text-align: center;">
                <strong>Telefone/WhatsApp:</strong> 99 8171-6531 &nbsp;|&nbsp; <strong>E-mail:</strong> contato@institutoignis.com.br
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 4px; color: #888; font-size: 13px;">
                Instituto Ignis de Educação Digital • Polos em todo o Brasil
              </p>
              <p style="margin: 0; color: #aaa; font-size: 12px;">
                © ${currentYear} Todos os direitos reservados.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
