import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const email = process.argv[2];
const password = process.argv[3];
const fullName = process.argv[4];
const courseId = process.argv[5];

if (!SUPABASE_URL) throw new Error("Falta SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
if (!email || !password || !fullName) {
  throw new Error('Uso: node create-student-user.mjs email senha "Nome Completo" [courseId]');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    full_name: fullName,
  },
});

if (authError) throw authError;

const userId = authData.user.id;

const { error: profileError } = await supabase
  .from("profiles")
  .upsert(
    {
      user_id: userId,
      full_name: fullName,
      email,
    },
    { onConflict: "user_id" }
  );

if (profileError) throw profileError;

const { error: roleError } = await supabase
  .from("user_roles")
  .upsert(
    {
      user_id: userId,
      role: "aluno",
    },
    { onConflict: "user_id,role" }
  );

if (roleError) throw roleError;

if (courseId) {
  const { error: enrollmentError } = await supabase
    .from("enrollments")
    .insert({
      user_id: userId,
      course_id: courseId,
      is_active: true,
    });

  if (enrollmentError) throw enrollmentError;
}

console.log(JSON.stringify({ userId, email, courseId: courseId || null }, null, 2));
