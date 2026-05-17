import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Demo polo configuration
const DEMO_POLO_NAME = 'Gestor';
const DEMO_POLO_ID = 'aee37a07-2f47-4f6f-ba50-0ccde1617b21';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify the caller is from the demo polo
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const supabaseAuth = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: userData } = await supabaseAuth.auth.getUser();
      if (userData?.user) {
        const { data: poloUser } = await supabaseAdmin
          .from('polo_users')
          .select('polo_id')
          .eq('user_id', userData.user.id)
          .single();
        
        if (poloUser?.polo_id !== DEMO_POLO_ID) {
          return new Response(
            JSON.stringify({ error: 'Apenas o polo de demonstração pode usar esta função' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    console.log('Starting demo polo data cleanup...');

    // Step 1: Get all enrollments for demo polo
    const { data: enrollments } = await supabaseAdmin
      .from('enrollments')
      .select('id, user_id, course_id')
      .eq('polo_id', DEMO_POLO_ID);

    console.log(`Found ${enrollments?.length || 0} enrollments to clean up`);

    let deletedStudents = 0;

    // Step 2: Delete related data for each enrollment
    if (enrollments && enrollments.length > 0) {
      const userIds = [...new Set(enrollments.map(e => e.user_id))];
      
      // Delete payments
      for (const enrollment of enrollments) {
        await supabaseAdmin
          .from('payments')
          .delete()
          .eq('user_id', enrollment.user_id)
          .eq('course_id', enrollment.course_id);
      }
      console.log('Deleted payments');

      // Delete enrollments
      await supabaseAdmin
        .from('enrollments')
        .delete()
        .eq('polo_id', DEMO_POLO_ID);
      console.log('Deleted enrollments');

      // Get the polo admin user ID to exclude from deletion
      const { data: poloUserRecord } = await supabaseAdmin
        .from('polo_users')
        .select('user_id')
        .eq('polo_id', DEMO_POLO_ID)
        .single();

      // Delete test users (not the polo admin user)
      const testUserIds = userIds.filter(id => id !== poloUserRecord?.user_id);
      
      for (const userId of testUserIds) {
        try {
          // Delete user roles
          await supabaseAdmin
            .from('user_roles')
            .delete()
            .eq('user_id', userId);
          
          // Delete profile
          await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('user_id', userId);
          
          // Delete auth user
          await supabaseAdmin.auth.admin.deleteUser(userId);
          deletedStudents++;
        } catch (err) {
          console.log(`Error deleting user ${userId}:`, err);
        }
      }
      console.log(`Deleted ${deletedStudents} students`);
    }

    console.log('Cleanup complete. Polo is now clean for training.');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Dados do polo ${DEMO_POLO_NAME} limpos com sucesso! O sistema está pronto para treinamento.`,
        deletedStudents
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error cleaning demo polo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
