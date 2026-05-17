import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CertificateRequest {
  courseId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      throw new Error("Invalid token");
    }

    const { courseId }: CertificateRequest = await req.json();

    // Check if certificate already exists
    const { data: existingCert } = await supabase
      .from("certificates")
      .select("*")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .single();

    if (existingCert) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          certificate: existingCert,
          message: "Certificado já existe" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check enrollment
    const { data: enrollment, error: enrollmentError } = await supabase
      .from("enrollments")
      .select("*, courses(*)")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .eq("is_active", true)
      .single();

    if (enrollmentError || !enrollment) {
      throw new Error("Matrícula não encontrada");
    }

    // Get all lessons for the course
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id")
      .eq("course_id", courseId)
      .eq("is_active", true);

    if (!lessons || lessons.length === 0) {
      throw new Error("Curso não possui aulas");
    }

    // Check lesson progress
    const { data: progress } = await supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .eq("completed", true)
      .in("lesson_id", lessons.map(l => l.id));

    const completedLessons = progress?.length || 0;
    const totalLessons = lessons.length;
    const progressPercent = (completedLessons / totalLessons) * 100;

    if (progressPercent < 100) {
      throw new Error(`Progresso insuficiente: ${progressPercent.toFixed(0)}% (necessário 100%)`);
    }

    // Check if there are exams and if user passed them
    const { data: exams } = await supabase
      .from("exams")
      .select("id, passing_score")
      .eq("course_id", courseId)
      .eq("is_active", true);

    if (exams && exams.length > 0) {
      for (const exam of exams) {
        const { data: attempts } = await supabase
          .from("exam_attempts")
          .select("passed")
          .eq("exam_id", exam.id)
          .eq("user_id", user.id)
          .eq("passed", true);

        if (!attempts || attempts.length === 0) {
          throw new Error(`Você precisa ser aprovado em todas as provas do curso`);
        }
      }
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single();

    // Generate certificate
    const certificateNumber = generateCertificateNumber();
    const validationHash = await generateValidationHash(user.id, courseId, certificateNumber);

    const { data: certificate, error: certError } = await supabase
      .from("certificates")
      .insert({
        user_id: user.id,
        course_id: courseId,
        certificate_number: certificateNumber,
        validation_hash: validationHash,
      })
      .select()
      .single();

    if (certError) {
      throw certError;
    }

    // Update enrollment as completed
    await supabase
      .from("enrollments")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", enrollment.id);

    // Notify all admins about the new certificate with download link
    const { data: adminUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminUsers && adminUsers.length > 0) {
      const downloadLink = `/student/certificates/${certificate.id}/download`;
      const notifications = adminUsers.map((admin) => ({
        user_id: admin.user_id,
        title: "Novo Certificado Gerado",
        message: `O aluno ${profile?.full_name || user.email} gerou o certificado do curso "${enrollment.courses?.title}". Baixar: ${downloadLink}`,
        type: "certificate",
        related_id: certificate.id,
        related_type: "certificate",
        target_role: "admin",
      }));

      await supabase.from("notifications").insert(notifications);
    }

    return new Response(
      JSON.stringify({
        success: true,
        certificate: {
          ...certificate,
          student_name: profile?.full_name || user.email,
          course_title: enrollment.courses?.title,
          workload_hours: enrollment.courses?.workload_hours,
        },
        message: "Certificado gerado com sucesso!",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error generating certificate:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateCertificateNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `CERT-${year}-${random}`;
}

async function generateValidationHash(userId: string, courseId: string, certNumber: string): Promise<string> {
  const secret = Deno.env.get("CERTIFICATE_HMAC_SECRET");
  
  // Use HMAC-SHA256 if secret is configured, otherwise use a secure random hash
  if (secret) {
    const data = `${userId}-${courseId}-${certNumber}`;
    
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(data)
    );
    
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 12)
      .toUpperCase();
  } else {
    // Fallback: use crypto.randomUUID for unique hash (still secure, just not verifiable)
    console.warn("CERTIFICATE_HMAC_SECRET not configured - using random hash");
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 12)
      .toUpperCase();
  }
}
