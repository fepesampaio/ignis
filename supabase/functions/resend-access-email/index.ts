import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  enrollmentId?: string;
  email?: string;
}

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
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 3px solid #1e5bb8;">
              <h1 style="margin: 0 0 8px; color: #1e5bb8; font-size: 28px; font-weight: 700;">Instituto Ignis</h1>
              <p style="margin: 0; color: #666; font-size: 14px; font-weight: 500;">De Educacao Digital</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center;">
              <h2 style="margin: 0 0 16px; color: #333; font-size: 22px; font-weight: 600;">Parabens, ${fullName}!</h2>
              <p style="margin: 0; color: #555; font-size: 16px; line-height: 1.6;">
                Sua matricula foi concluida com sucesso. Abaixo estao os dados de acesso ao portal do aluno.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px;">
              <div style="background-color: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
                <div style="margin-bottom: 16px;">
                  <p style="margin: 0 0 4px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Link de acesso:</p>
                  <a href="${loginUrl}" style="color: #1e5bb8; font-size: 15px; text-decoration: none; word-break: break-all;">${loginUrl}</a>
                </div>
                <div style="margin-bottom: 16px;">
                  <p style="margin: 0 0 4px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Usuario:</p>
                  <p style="margin: 0; color: #333; font-size: 15px; word-break: break-all;">${email}</p>
                </div>
                <div>
                  <p style="margin: 0 0 4px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Senha:</p>
                  <p style="margin: 0; color: #333; font-size: 15px; font-family: monospace; background: #fff; padding: 6px 10px; border-radius: 4px; display: inline-block; border: 1px solid #ddd;">${password}</p>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px; text-align: center;">
              <a href="${loginUrl}" style="display: inline-block; background-color: #1e5bb8; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-size: 16px; font-weight: 600;">Acessar minha conta</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; background-color: #f8f9fa; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.6; text-align: center;">
                Em caso de dificuldade, entre em contato por WhatsApp 99 8171-6531 ou email contato@institutoignis.com.br
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 4px; color: #888; font-size: 13px;">Instituto Ignis de Educacao Digital</p>
              <p style="margin: 0; color: #aaa; font-size: 12px;">© ${currentYear} Todos os direitos reservados.</p>
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authUserData, error: authUserError } = await supabase.auth.getUser(token);
    if (authUserError || !authUserData.user) {
      throw new Error("Invalid token");
    }

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authUserData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleData) {
      throw new Error("Unauthorized");
    }

    const body: RequestBody = await req.json();
    if (!body.enrollmentId && !body.email) {
      throw new Error("enrollmentId or email is required");
    }

    let enrollmentQuery = supabase
      .from("enrollments")
      .select("id, user_id, course_id, contract_status, enrolled_at");

    if (body.enrollmentId) {
      enrollmentQuery = enrollmentQuery.eq("id", body.enrollmentId);
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", body.email)
        .single();

      if (!profile) {
        throw new Error("Student not found");
      }

      enrollmentQuery = enrollmentQuery.eq("user_id", profile.user_id).order("enrolled_at", { ascending: false }).limit(1);
    }

    const { data: enrollment, error: enrollmentError } = await enrollmentQuery.single();
    if (enrollmentError || !enrollment) {
      throw new Error("Enrollment not found");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, email, cpf")
      .eq("user_id", enrollment.user_id)
      .single();

    if (profileError || !profile) {
      throw new Error("Student profile not found");
    }

    const { data: course } = await supabase
      .from("courses")
      .select("title")
      .eq("id", enrollment.course_id)
      .single();

    if (!profile.email) {
      throw new Error("Student email not found");
    }

    let passwordCpf = profile.cpf || "";
    if (passwordCpf && !passwordCpf.includes(".")) {
      const cleanCpf = passwordCpf.replace(/\D/g, "");
      if (cleanCpf.length === 11) {
        passwordCpf = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      }
    }

    const passwordForLogin = passwordCpf.replace(/\D/g, "");
    if (!passwordForLogin) {
      throw new Error("Student CPF not found");
    }

    const resend = new Resend(resendApiKey);
    const loginUrl = "https://ead.institutoignis.com.br";
    const emailHtml = generateWelcomeEmailHtml({
      fullName: profile.full_name || "Aluno",
      email: profile.email,
      password: passwordForLogin,
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
      throw new Error(emailError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        enrollmentId: enrollment.id,
        email: profile.email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error resending access email:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
