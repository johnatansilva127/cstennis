import { testEnv } from "./env";

export default async function setup() {
  const env = testEnv();
  const res = await fetch(`${env.url}/auth/v1/health`, { headers: { apikey: env.anonKey } });
  if (!res.ok) {
    throw new Error(`Supabase local indisponível (${res.status}). Rode \`npx supabase start\`.`);
  }
}
