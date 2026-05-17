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
    const url = new URL(req.url);
    const hash = url.searchParams.get("hash");

    if (!hash) {
      throw new Error("Hash de validação não fornecido");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find certificate by hash
    const { data: certificate, error } = await supabase
      .from("certificates")
      .select(`
        *,
        courses (
          title,
          workload_hours,
          category
        )
      `)
      .eq("validation_hash", hash)
      .single();

    if (error || !certificate) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          message: "Certificado não encontrado" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get student name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", certificate.user_id)
      .single();

    return new Response(
      JSON.stringify({
        valid: true,
        certificate: {
          certificate_number: certificate.certificate_number,
          issued_at: certificate.issued_at,
          student_name: profile?.full_name || "Nome não disponível",
          course_title: certificate.courses?.title,
          workload_hours: certificate.courses?.workload_hours,
          category: certificate.courses?.category,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error validating certificate:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ valid: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
