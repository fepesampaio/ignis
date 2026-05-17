import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateEmployeeRequest {
  email: string;
  password: string;
  full_name: string;
  role: "admin" | "professor" | "polo";
  polo_id?: string;
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
        JSON.stringify({ success: false, error: "Apenas administradores podem criar funcionários" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, full_name, role, polo_id }: CreateEmployeeRequest = await req.json();

    if (!email || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ success: false, error: "Dados incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["admin", "professor", "polo"].includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: "Perfil inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate polo_id is required for polo role
    if (role === "polo" && !polo_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Polo é obrigatório para usuários do tipo Polo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify polo exists if polo_id is provided
    if (polo_id) {
      const { data: poloData, error: poloError } = await supabaseAdmin
        .from("polos")
        .select("id, name")
        .eq("id", polo_id)
        .single();

      if (poloError || !poloData) {
        return new Response(
          JSON.stringify({ success: false, error: "Polo não encontrado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      if (createError.message.includes("already registered")) {
        return new Response(
          JSON.stringify({ success: false, error: "Este e-mail já está cadastrado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw createError;
    }

    // Update profile with full name (trigger creates default)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ full_name })
      .eq("user_id", newUser.user.id);

    if (profileError) {
      console.error("Error updating profile:", profileError);
    }

    // Update role (trigger creates default 'aluno')
    const { error: updateRoleError } = await supabaseAdmin
      .from("user_roles")
      .update({ role })
      .eq("user_id", newUser.user.id);

    if (updateRoleError) {
      console.error("Error updating role:", updateRoleError);
      throw updateRoleError;
    }

    // If polo role, link user to polo
    if (role === "polo" && polo_id) {
      const { error: poloUserError } = await supabaseAdmin
        .from("polo_users")
        .insert({
          user_id: newUser.user.id,
          polo_id: polo_id,
        });

      if (poloUserError) {
        console.error("Error linking user to polo:", poloUserError);
        throw poloUserError;
      }
    }

    console.log(`Employee created: ${email} with role ${role}${polo_id ? ` linked to polo ${polo_id}` : ""}`);

    return new Response(
      JSON.stringify({ success: true, userId: newUser.user.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in create-employee:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});