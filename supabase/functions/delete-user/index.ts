import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeleteUserRequest {
  userId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if requesting user is admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .single();

    if (roleError || roleData?.role !== "admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Apenas administradores podem excluir usuários" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the user to delete
    const { userId } = await req.json() as DeleteUserRequest;

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "ID do usuário é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent deleting yourself
    if (userId === requestingUser.id) {
      return new Response(
        JSON.stringify({ success: false, error: "Você não pode excluir sua própria conta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin ${requestingUser.email} deleting user ${userId}`);

    // Delete related data in order (due to foreign keys)
    // Note: Some tables may have ON DELETE CASCADE, but we handle explicitly for safety

    // Delete activity answers
    await supabaseAdmin.from("activity_answers").delete().eq("user_id", userId);
    console.log("Deleted activity answers");

    // Delete exam answers (through attempts)
    const { data: attempts } = await supabaseAdmin
      .from("exam_attempts")
      .select("id")
      .eq("user_id", userId);
    
    if (attempts && attempts.length > 0) {
      const attemptIds = attempts.map(a => a.id);
      await supabaseAdmin.from("exam_answers").delete().in("attempt_id", attemptIds);
    }
    console.log("Deleted exam answers");

    // Delete exam attempts
    await supabaseAdmin.from("exam_attempts").delete().eq("user_id", userId);
    console.log("Deleted exam attempts");

    // Delete assignment submissions
    await supabaseAdmin.from("assignment_submissions").delete().eq("user_id", userId);
    console.log("Deleted assignment submissions");

    // Delete lesson progress
    await supabaseAdmin.from("lesson_progress").delete().eq("user_id", userId);
    console.log("Deleted lesson progress");

    // Delete certificates
    await supabaseAdmin.from("certificates").delete().eq("user_id", userId);
    console.log("Deleted certificates");

    // Delete payments
    await supabaseAdmin.from("payments").delete().eq("user_id", userId);
    console.log("Deleted payments");

    // Delete enrollments
    await supabaseAdmin.from("enrollments").delete().eq("user_id", userId);
    console.log("Deleted enrollments");

    // Delete notifications
    await supabaseAdmin.from("notifications").delete().eq("user_id", userId);
    console.log("Deleted notifications");

    // Delete course_professors if this user is a professor
    await supabaseAdmin.from("course_professors").delete().eq("professor_id", userId);
    console.log("Deleted course professor assignments");

    // Delete user role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    console.log("Deleted user role");

    // Delete profile
    await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
    console.log("Deleted profile");

    // Finally, delete the auth user
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (deleteAuthError) {
      console.error("Error deleting auth user:", deleteAuthError);
      throw new Error(`Erro ao excluir conta de acesso: ${deleteAuthError.message}`);
    }
    console.log("Deleted auth user");

    console.log(`User ${userId} deleted successfully`);

    return new Response(
      JSON.stringify({ success: true, message: "Usuário excluído com sucesso" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in delete-user function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
