/**
 * Provisionamento administrativo da conta do professor.
 *
 * Uso (em máquina confiável, com as variáveis do ambiente alvo):
 *   npx tsx --env-file=.env.production.local scripts/bootstrap-coach.ts \
 *     --email professor@dominio.com --name "Nome do Professor" [--org "CS Tennis"]
 *
 * - Cria a conta (sem senha) e a organização, e vincula como professor.
 * - Imprime UMA vez um link de uso único (expira em 15 min) para definir a senha.
 * - No primeiro acesso o professor é obrigado a configurar a verificação em duas etapas.
 * Não há cadastro público que permita virar professor.
 */
import { createClient } from "@supabase/supabase-js";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const email = arg("email")?.toLowerCase();
const name = arg("name") ?? "";
const org = arg("org") ?? "CS Tennis";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.APP_URL;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error("Informe --email válido.");
  process.exit(1);
}
if (!url || !key || !appUrl) {
  console.error("Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e APP_URL (use --env-file).");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserId(target: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  let userId = await findUserId(email!);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userId = data.user.id;
    console.log("Conta criada.");
  } else {
    console.log("Conta já existia; será vinculada como professor.");
  }
  const { data: orgId, error } = await admin.rpc("bootstrap_coach", { p_org_name: org, p_user_id: userId, p_timezone: "America/Sao_Paulo" });
  if (error) throw error;
  if (name) await admin.from("user_profiles").update({ full_name: name }).eq("user_id", userId);
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "recovery", email: email! });
  if (linkErr) throw linkErr;
  console.log(`Organização: ${orgId}`);
  console.log("\nLink de uso único para definir a senha (não compartilhe; expira em 15 minutos):");
  console.log(`${appUrl}/auth/confirm?token_hash=${link.properties.hashed_token}&type=recovery\n`);
  console.log("Depois de definir a senha, o professor configurará a verificação em duas etapas no primeiro acesso.");
}

main().catch((e) => {
  console.error("Falha no provisionamento:", e?.message ?? e);
  process.exit(1);
});
