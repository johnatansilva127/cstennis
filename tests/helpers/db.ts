import pg from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Secret, TOTP } from "otpauth";
import { randomUUID } from "node:crypto";
import { testEnv } from "./env";

const env = testEnv();

/** Conexão direta como `postgres` — somente para preparar cenários e inspecionar. */
export const pool = new pg.Pool({ connectionString: env.dbUrl, max: 5 });

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export const admin = createClient(env.url, env.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function anonClient(): SupabaseClient {
  return createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const PASSWORD = "Senha-de-teste-2026";

export function uniqueEmail(prefix: string) {
  return `${prefix}.${randomUUID().slice(0, 8)}@example.test`;
}

export async function createUser(email: string, password = PASSWORD) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user!;
}

export type Session = {
  client: SupabaseClient;
  userId: string;
  email: string;
  totpSecret?: string;
  factorId?: string;
};

export async function signIn(email: string, password = PASSWORD): Promise<Session> {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, userId: data.user.id, email };
}

const lastTotpWindow = new Map<string, number>();
async function freshTotp(secret: string) {
  // Evita reutilizar o mesmo código (mesmo segredo) na mesma janela de 30s.
  const totp = new TOTP({ secret: Secret.fromBase32(secret) });
  let window = Math.floor(Date.now() / 30000);
  if (lastTotpWindow.get(secret) === window) {
    await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 200));
    window = Math.floor(Date.now() / 30000);
  }
  lastTotpWindow.set(secret, window);
  return totp.generate();
}

export async function enrollTotp(session: Session) {
  const { data, error } = await session.client.auth.mfa.enroll({ factorType: "totp", friendlyName: `t-${randomUUID().slice(0, 6)}` });
  if (error) throw error;
  session.totpSecret = data.totp.secret;
  session.factorId = data.id;
  await verifyTotp(session);
}

export async function verifyTotp(session: Session) {
  const { data: ch, error: chErr } = await session.client.auth.mfa.challenge({ factorId: session.factorId! });
  if (chErr) throw chErr;
  const { error } = await session.client.auth.mfa.verify({
    factorId: session.factorId!,
    challengeId: ch.id,
    code: await freshTotp(session.totpSecret!),
  });
  if (error) throw error;
}

export type Org = { orgId: string; coach: Session };

/** Cria organização + professor com MFA (aal2), como o bootstrap administrativo. */
export async function setupOrg(name = `Org ${randomUUID().slice(0, 6)}`): Promise<Org> {
  const email = uniqueEmail("coach");
  const user = await createUser(email);
  const { data: orgId, error } = await admin.rpc("bootstrap_coach", { p_org_name: name, p_user_id: user.id });
  if (error) throw error;
  const coach = await signIn(email);
  await enrollTotp(coach);
  return { orgId: orgId as string, coach };
}

/** Executa RPC e retorna data, lançando erro com código e mensagem. */
export async function rpc<T = unknown>(session: Session | SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const client = "client" in session ? session.client : session;
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    const e = new Error(`${error.code}: ${error.message}`) as Error & { code?: string };
    e.code = error.code;
    throw e;
  }
  return data as T;
}

export async function rpcError(session: Session | SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const client = "client" in session ? session.client : session;
  const { data, error } = await client.rpc(fn, args);
  if (!error) throw new Error(`Esperava erro em ${fn}, recebeu ${JSON.stringify(data)}`);
  return error;
}

export async function orgToday(orgId: string): Promise<string> {
  const rows = await sql<{ d: string }>("select private.org_today($1)::text as d", [orgId]);
  return rows[0].d;
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Próxima data (>= from) com o dia ISO da semana (1=segunda). */
export function nextWeekday(from: string, isoDow: number) {
  const d = new Date(`${from}T12:00:00Z`);
  const cur = ((d.getUTCDay() + 6) % 7) + 1;
  d.setUTCDate(d.getUTCDate() + ((isoDow - cur + 7) % 7));
  return d.toISOString().slice(0, 10);
}

export async function createLocation(org: Org, name = `Clube ${randomUUID().slice(0, 4)}`) {
  const locationId = await rpc<string>(org.coach, "save_location", {
    p_location_id: null,
    p_payload: { name, address: "Rua Fictícia, 100" },
  });
  const courtId = await rpc<string>(org.coach, "save_court", {
    p_court_id: null,
    p_location_id: locationId,
    p_payload: { name: "Quadra 1" },
  });
  return { locationId, courtId };
}

export async function createSeries(org: Org, payload: Record<string, unknown>) {
  return rpc<string>(org.coach, "create_series", { p_payload: payload });
}

export async function createAdultStudent(org: Org, extra: Record<string, unknown> = {}) {
  const res = await rpc<{ student_id: string; invitation: { token: string } | null }>(org.coach, "create_student", {
    p_payload: { full_name: `Aluno ${randomUUID().slice(0, 5)}`, kind: "adult", email: uniqueEmail("aluno"), ...extra },
  });
  return res;
}

/** Cria aluno adulto com conta vinculada via convite aceito. */
export async function createLinkedAdult(org: Org, extra: Record<string, unknown> = {}) {
  const email = uniqueEmail("adulto");
  const res = await rpc<{ student_id: string; invitation: { token: string } }>(org.coach, "create_student", {
    p_payload: { full_name: `Adulto ${randomUUID().slice(0, 5)}`, kind: "adult", email, invite: true, ...extra },
  });
  await createUser(email);
  const session = await signIn(email);
  const accepted = await rpc<{ ok: boolean; code: string }>(session, "accept_invitation", { p_token: res.invitation.token });
  if (!accepted.ok) throw new Error(`accept failed: ${accepted.code}`);
  return { studentId: res.student_id, session };
}

/** Cria criança + responsável com conta vinculada. */
export async function createLinkedChild(org: Org, guardian?: { guardianId: string }) {
  const email = uniqueEmail("resp");
  const payload: Record<string, unknown> = { full_name: `Criança ${randomUUID().slice(0, 5)}`, kind: "child" };
  payload.guardian = guardian ? { id: guardian.guardianId } : { full_name: "Responsável Teste", email, relationship: "mãe" };
  payload.invite = !guardian;
  const res = await rpc<{ student_id: string; guardian_id: string; invitation: { token: string } | null }>(
    org.coach, "create_student", { p_payload: payload });
  let session: Session | undefined;
  if (res.invitation) {
    await createUser(email);
    session = await signIn(email);
    const accepted = await rpc<{ ok: boolean; code: string }>(session, "accept_invitation", { p_token: res.invitation.token });
    if (!accepted.ok) throw new Error(`accept failed: ${accepted.code}`);
  }
  return { studentId: res.student_id, guardianId: res.guardian_id, session };
}

export async function processOutbox() {
  await sql("select private.process_outbox(1000)");
}
