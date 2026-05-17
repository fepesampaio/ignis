import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateAccessRequest {
  userId: string;
  newEmail?: string;
  newPassword?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin token
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado" }),
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
        JSON.stringify({ success: false, error: "Apenas administradores podem alterar dados de acesso" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, newEmail, newPassword }: UpdateAccessRequest = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "ID do usuário não informado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!newEmail && !newPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhum dado para alterar" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare update object
    const updateData: { email?: string; password?: string } = {};
    
    if (newEmail) {
      updateData.email = newEmail;
    }
    
    if (newPassword) {
      if (newPassword.length < 6) {
        return new Response(
          JSON.stringify({ success: false, error: "A senha deve ter pelo menos 6 caracteres" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      updateData.password = newPassword;
    }

    // Update user auth data
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, updateData);

    if (updateError) {
      console.error("Error updating user access:", updateError);
      throw updateError;
    }

    // If email was updated, also update the profiles table
    if (newEmail) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ email: newEmail })
        .eq("user_id", userId);

      if (profileError) {
        console.error("Error updating profile email:", profileError);
        // Don't throw, auth update was successful
      }
    }

    console.log(`Access updated for user ${userId}: email=${!!newEmail}, password=${!!newPassword}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in update-user-access:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
