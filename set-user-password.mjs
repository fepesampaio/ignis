import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const newPassword = process.argv[3];

if (!SUPABASE_URL) throw new Error("Falta SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
if (!email) throw new Error("Uso: node set-user-password.mjs email novaSenha");
if (!newPassword) throw new Error("Uso: node set-user-password.mjs email novaSenha");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.listUsers();

if (error) throw error;

const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (!user) {
  throw new Error(`Usuário não encontrado: ${email}`);
}

const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
  password: newPassword,
});

if (updateError) throw updateError;

console.log(`Senha atualizada para ${email} (${user.id})`);
