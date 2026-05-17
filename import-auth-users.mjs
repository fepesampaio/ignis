import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://fteosxivqodhnaikesht.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USERS_FILE = process.env.USERS_FILE || "./users.json";

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Defina SUPABASE_SERVICE_ROLE_KEY antes de executar o script.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const raw = await fs.readFile(USERS_FILE, "utf8");
const users = JSON.parse(raw);

const results = {
  created: [],
  existing: [],
  failed: [],
  skipped: [],
};

for (const item of users) {
  const id = item?.id;
  const email = item?.email_data?.email;

  if (!id || !email) {
    results.skipped.push({ id: id ?? null, email: email ?? null, reason: "missing_id_or_email" });
    continue;
  }

  const password = `Temp@${id.slice(0, 8)}!`;

  const { data, error } = await supabase.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: item?.email_data?.email_verified ?? true,
    user_metadata: {
      display_name: item?.display_name ?? null,
      imported_from_lovable: true,
      original_created_at: item?.created_at ?? null,
      original_last_sign_in_at: item?.last_sign_in_at ?? null,
      providers: item?.providers ?? [],
    },
  });

  if (error) {
    const message = error.message || "unknown_error";
    if (message.toLowerCase().includes("already been registered") || message.toLowerCase().includes("already exists")) {
      results.existing.push({ id, email, message });
    } else {
      results.failed.push({ id, email, message });
    }
    continue;
  }

  results.created.push({ id: data.user?.id ?? id, email });
}

await fs.writeFile("./import-auth-users-report.json", JSON.stringify(results, null, 2));

console.log(`Criados: ${results.created.length}`);
console.log(`Ja existentes: ${results.existing.length}`);
console.log(`Falhas: ${results.failed.length}`);
console.log(`Ignorados: ${results.skipped.length}`);
console.log("Relatorio salvo em ./import-auth-users-report.json");
