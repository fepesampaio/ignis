import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://fteosxivqodhnaikesht.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Defina SUPABASE_SERVICE_ROLE_KEY antes de executar o script.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

let page = 1;
const perPage = 200;
let totalDeleted = 0;

while (true) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage,
  });

  if (error) {
    throw error;
  }

  const users = data?.users ?? [];
  if (users.length === 0) {
    break;
  }

  for (const user of users) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.log(`ERRO ${user.email ?? user.id}: ${deleteError.message}`);
      continue;
    }

    totalDeleted++;
    console.log(`Removido: ${user.email ?? user.id}`);
  }

  if (users.length < perPage) {
    break;
  }
}

console.log(`Total removido: ${totalDeleted}`);
