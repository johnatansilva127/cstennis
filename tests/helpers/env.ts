import { execSync } from "node:child_process";

export type TestEnv = {
  url: string;
  anonKey: string;
  serviceKey: string;
  dbUrl: string;
};

let cached: TestEnv | null = null;

/**
 * Lê as credenciais do Supabase LOCAL (CLI). Os testes de integração nunca
 * devem apontar para produção: recusamos qualquer URL que não seja localhost.
 */
export function testEnv(): TestEnv {
  if (cached) return cached;
  let url = process.env.TEST_SUPABASE_URL;
  let anonKey = process.env.TEST_SUPABASE_ANON_KEY;
  let serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  let dbUrl = process.env.TEST_DATABASE_URL;
  if (!url || !anonKey || !serviceKey || !dbUrl) {
    const out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const vars: Record<string, string> = {};
    for (const line of out.split("\n")) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      if (m) vars[m[1]] = m[2];
    }
    url = vars.API_URL;
    anonKey = vars.ANON_KEY;
    serviceKey = vars.SERVICE_ROLE_KEY;
    dbUrl = vars.DB_URL;
  }
  if (!url || !anonKey || !serviceKey || !dbUrl) {
    throw new Error("Supabase local não encontrado. Rode `npx supabase start`.");
  }
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(`Recusando executar testes contra ${host}: use apenas o ambiente local.`);
  }
  cached = { url, anonKey, serviceKey, dbUrl };
  return cached;
}
