/**
 * Dados FICTÍCIOS para desenvolvimento/homologação. Nunca use dados reais.
 *
 *   npx supabase start && node scripts/local-env.mjs
 *   npx tsx --env-file=.env.local scripts/seed-demo.ts
 *
 * Recusa rodar fora do Supabase local, exceto com --allow-staging e APP_ENV=staging.
 * Grava as credenciais de demonstração em .demo-credentials.json (ignorado pelo git).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Secret, TOTP } from "otpauth";
import pg from "pg";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const host = new URL(url).hostname;
const local = host === "127.0.0.1" || host === "localhost";
if (!local && !(process.argv.includes("--allow-staging") && process.env.APP_ENV === "staging")) {
  console.error(`Recusado: ${host} não é local. Use --allow-staging apenas em homologação (APP_ENV=staging).`);
  process.exit(1);
}

const PASS = "Demo-CSTennis-2026";
const DOMAIN = "demo.cstennis.test";
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function must<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

async function ensureUser(email: string, fullName: string) {
  const { data } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true, user_metadata: { full_name: fullName } });
  if (data.user) return data.user.id;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return list.users.find((u) => u.email === email)!.id;
}

async function signIn(email: string) {
  const client = anon();
  await must(client.auth.signInWithPassword({ email, password: PASS }), `login ${email}`);
  return client;
}

async function main() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const dow = (d: string) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

  // Professor + organização + MFA
  const coachEmail = `professor@${DOMAIN}`;
  const coachId = await ensureUser(coachEmail, "Professor Demonstração");
  const orgId = await must(admin.rpc("bootstrap_coach", { p_org_name: "CS Tennis (demonstração)", p_user_id: coachId }), "bootstrap");
  const coach = await signIn(coachEmail);
  const { data: factors } = await coach.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) await coach.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
  await admin.auth.admin.mfa.listFactors({ userId: coachId }).then(async ({ data }) => {
    for (const f of data?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: coachId, id: f.id });
  });
  const enrolled = await must<{ id: string; totp: { secret: string } }>(coach.auth.mfa.enroll({ factorType: "totp", friendlyName: "Demo" }), "mfa enroll");
  const totp = new TOTP({ secret: Secret.fromBase32(enrolled.totp.secret) });
  await must(coach.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp.generate() }), "mfa verify");
  const rpc = <T = unknown>(client: SupabaseClient, fn: string, args: Record<string, unknown>) => must<T>(client.rpc(fn, args), fn);

  await rpc(coach, "update_organization_settings", { p_settings: {
    contact_info: "Atendimento pelo app ou WhatsApp do professor, de segunda a sexta, das 8h às 18h.",
    privacy_controller: "Professor Demonstração (fictício)", privacy_contact: `privacidade@${DOMAIN}` } });
  await rpc(coach, "update_pix_settings", {
    p_receiver_name: "Professor Demonstracao", p_key_type: "evp", p_pix_key: "123e4567-e12b-12d1-a456-426655440000",
    p_city: "Sao Paulo", p_brcode_enabled: true });

  // Locais e quadras
  const azul = await rpc<string>(coach, "save_location", { p_location_id: null, p_payload: { name: "Clube Azul", address: "Rua Fictícia, 100 — Bairro Exemplo", instructions: "Entrada pela portaria 2. Estacionamento no subsolo." } });
  const azul1 = await rpc<string>(coach, "save_court", { p_court_id: null, p_location_id: azul, p_payload: { name: "Quadra 1", surface: "Saibro" } });
  const azul2 = await rpc<string>(coach, "save_court", { p_court_id: null, p_location_id: azul, p_payload: { name: "Quadra 2", surface: "Rápida" } });
  const sul = await rpc<string>(coach, "save_location", { p_location_id: null, p_payload: { name: "Arena Sul", address: "Avenida Modelo, 2000" } });
  const sulC = await rpc<string>(coach, "save_court", { p_court_id: null, p_location_id: sul, p_payload: { name: "Quadra Central", surface: "Rápida" } });

  // Séries (uma no dia de hoje para histórico e chamada)
  const series = async (p: Record<string, unknown>) => rpc<string>(coach, "create_series", { p_payload: { valid_from: today, ...p } });
  const sToday = await series({ title: "Turma intermediária", weekday: dow(today), start_time: "07:00", duration_minutes: 60, format: "group", capacity: 4, location_id: azul, court_id: azul1, travel_buffer_minutes: 30, level: "Intermediário" });
  const sInd = await series({ weekday: ((dow(today) % 7) + 1), start_time: "18:00", duration_minutes: 60, format: "individual", location_id: azul, court_id: azul2 });
  const sDup = await series({ weekday: ((dow(today) + 1) % 7) + 1, start_time: "19:30", duration_minutes: 60, format: "double", location_id: sul, court_id: sulC });
  const sKids = await series({ title: "Turma infantil", weekday: 6, start_time: "09:00", duration_minutes: 60, format: "group", capacity: 6, location_id: sul, court_id: sulC, level: "Iniciante" });
  await series({ title: "Turma avançada", weekday: 4, start_time: "20:00", duration_minutes: 90, format: "group", capacity: 4, location_id: azul, court_id: azul1, level: "Avançado" });

  // Alunos e contas (convites aceitos)
  const month = today.slice(0, 7) + "-01";
  async function adult(name: string, local: string, extra: Record<string, unknown>) {
    const email = `${local}@${DOMAIN}`;
    const res = await rpc<{ student_id: string; invitation: { token: string } }>(coach, "create_student", {
      p_payload: { full_name: name, kind: "adult", email, invite: true, ...extra } });
    await ensureUser(email, name);
    const s = await signIn(email);
    await rpc(s, "accept_invitation", { p_token: res.invitation.token });
    return { id: res.student_id, email, client: s };
  }
  const ana = await adult("Ana Exemplo", "ana", { level: "Intermediário", tuition: { amount_cents: 32000, due_day: 10, starts_month: month }, enrollments: [{ series_id: sToday }] });
  const bruno = await adult("Bruno Teste", "bruno", { tuition: { amount_cents: 45000, due_day: 5, starts_month: month }, enrollments: [{ series_id: sInd }] });
  const carla = await adult("Carla Modelo", "carla", { tuition: { amount_cents: 28000, due_day: 20, starts_month: month }, enrollments: [{ series_id: sDup }] });

  const guardianEmail = `marina@${DOMAIN}`;
  const clara = await rpc<{ student_id: string; guardian_id: string; invitation: { token: string } }>(coach, "create_student", {
    p_payload: { full_name: "Clara Fictícia", kind: "child", level: "Iniciante", invite: true,
      guardian: { full_name: "Marina Responsável", email: guardianEmail, relationship: "mãe" },
      tuition: { amount_cents: 22000, due_day: 31, starts_month: month }, enrollments: [{ series_id: sKids }] } });
  const davi = await rpc<{ student_id: string }>(coach, "create_student", {
    p_payload: { full_name: "Davi Fictício", kind: "child", guardian: { id: clara.guardian_id },
      tuition: { amount_cents: 22000, due_day: 15, starts_month: month }, enrollments: [{ series_id: sKids }] } });
  await ensureUser(guardianEmail, "Marina Responsável");
  const marina = await signIn(guardianEmail);
  await rpc(marina, "accept_invitation", { p_token: clara.invitation.token });

  // Aluno sem conta ainda (convite pendente)
  await rpc(coach, "create_student", { p_payload: { full_name: "Eduardo Pendente", kind: "adult", email: `eduardo@${DOMAIN}`, invite: true } });

  // Histórico (somente local): envelhece a turma de hoje em 4 semanas e registra presenças.
  if (local) {
    const dbUrl = JSON.parse(JSON.stringify(execSync("npx supabase status -o env", { encoding: "utf8" })))
      .split("\n").find((l: string) => l.startsWith("DB_URL="))?.split("=")[1]?.replace(/"/g, "");
    const db = new pg.Client({ connectionString: dbUrl });
    await db.connect();
    const past = addDays(today, -28);
    await db.query("update public.recurring_slots set valid_from = $2 where id = $1", [sToday, past]);
    await db.query("update public.enrollments set valid_from = $2 where series_id = $1", [sToday, past]);
    await db.query("select private.generate_occurrences($1, $2, $3)", [orgId, past, addDays(today, 90)]);
    const { rows } = await db.query<{ id: string; local_date: string }>(
      "select id, local_date::text from public.lesson_occurrences where series_id = $1 and local_date < $2 order by local_date", [sToday, today]);
    const marks = ["present", "present", "excused", "present"];
    for (let i = 0; i < rows.length; i++) {
      await rpc(coach, "save_attendance", { p_occurrence_id: rows[i].id, p_marks: [{ student_id: ana.id, status: marks[i % 4] }] });
    }
    // Uma cobrança vencida para demonstrar atraso (Carla).
    await rpc(coach, "create_manual_invoice", { p_student_id: carla.id, p_competence: addDays(month, -20).slice(0, 7) + "-01",
      p_amount_cents: 28000, p_due_date: addDays(today, -12), p_reason: "Mensalidade anterior (demonstração)" });
    await db.end();
  }
  await rpc(coach, "generate_invoices_now", {});

  // Pagamentos: Bruno quitou (baixa manual); Ana enviou comprovante (em análise).
  const invOf = async (studentId: string) => (await must<{ id: string; amount_cents: number }[]>(admin.from("invoices").select("id, amount_cents").eq("student_id", studentId).eq("status", "open").order("competence").limit(1), "inv"))?.[0];
  const bInv = await invOf(bruno.id);
  if (bInv) await rpc(coach, "record_manual_payment", { p_invoice_id: bInv.id, p_amount_cents: bInv.amount_cents, p_paid_on: today, p_method: "pix", p_justification: "Pix conferido no extrato (demonstração)" });
  const aInv = await invOf(ana.id);
  if (aInv) {
    const png = await sharp({ create: { width: 480, height: 720, channels: 3, background: "#f3f6fa" } })
      .composite([{ input: Buffer.from(`<svg width="480" height="720"><text x="40" y="120" font-size="36" font-family="Arial">Comprovante FICTÍCIO</text><text x="40" y="200" font-size="28" font-family="Arial">R$ 320,00</text></svg>`), top: 0, left: 0 }])
      .png().toBuffer();
    const begin = await rpc<{ file_id: string; bucket: string; object_path: string }>(ana.client, "begin_payment_submission", {
      p_invoice_id: aInv.id, p_detected_type: "png", p_mime_type: "image/png", p_size_bytes: png.length,
      p_sha256: createHash("sha256").update(png).digest("hex"), p_width: 480, p_height: 720, p_note: "Paguei hoje pelo app do banco." });
    await must(admin.storage.from(begin.bucket).upload(begin.object_path, png, { contentType: "image/png" }), "upload");
    await rpc(admin, "complete_payment_submission_upload", { p_file_id: begin.file_id, p_scan_status: "clean", p_scan_engine: "seed-demo (arquivo gerado)" });
  }

  // Evolução
  const a1 = await rpc<string>(coach, "save_assessment", { p_assessment_id: null, p_student_id: ana.id, p_payload: {
    assessed_on: addDays(today, -60), summary: "Boa base de fundo de quadra. Trabalhar a regularidade do backhand.",
    scores: { forehand: { score: 3 }, backhand: { score: 2 }, serve: { score: 2 }, movement: { score: 3 }, consistency: { score: 2 } } } });
  await rpc(coach, "publish_assessment", { p_assessment_id: a1 });
  const a2 = await rpc<string>(coach, "save_assessment", { p_assessment_id: null, p_student_id: ana.id, p_payload: {
    assessed_on: addDays(today, -7), summary: "Evolução clara no backhand e no saque. Próximo foco: voleio.",
    private_note: "Nota privada de exemplo (não aparece para a aluna).",
    scores: { forehand: { score: 4 }, backhand: { score: 3, comment: "Mais estável na cruzada." }, serve: { score: 3 }, return: { score: 3 },
      volley: { score: 2 }, movement: { score: 4 }, consistency: { score: 3 } } } });
  await rpc(coach, "publish_assessment", { p_assessment_id: a2 });
  await rpc(coach, "save_goal", { p_goal_id: null, p_student_id: ana.id, p_payload: { description: "Manter 10 bolas de backhand cruzado sem erro", target_date: addDays(today, 45), status: "in_progress" } });
  await rpc(coach, "save_goal", { p_goal_id: null, p_student_id: clara.student_id, p_payload: { description: "Sacar por cima com consistência", status: "open" } });

  // Jogos
  const m1 = await rpc<string>(ana.client, "save_match", { p_match_id: null, p_student_id: ana.id, p_payload: {
    played_on: addDays(today, -3), opponent_name: "Rival do clube", event_name: "Torneio interno (fictício)", format: "best_of_3",
    sets: [{ player_games: 6, opponent_games: 4 }, { player_games: 4, opponent_games: 6 }, { player_games: 7, opponent_games: 6, tiebreak_player: 7, tiebreak_opponent: 4 }],
    comments: "Joguei bem no tie-break final." } });
  await rpc(coach, "add_match_comment", { p_match_id: m1, p_body: "Ótima leitura no tie-break! Vamos treinar o segundo saque." });
  await rpc(marina, "save_match", { p_match_id: null, p_student_id: clara.student_id, p_payload: {
    played_on: addDays(today, -1), opponent_name: "Colega de turma", format: "short_sets_best_of_3",
    sets: [{ player_games: 4, opponent_games: 2 }, { player_games: 3, opponent_games: 1 }], result_kind: "incomplete" } });

  await admin.rpc("run_jobs_now", { p_job: "frequent" });
  const creds = {
    aviso: "Credenciais FICTÍCIAS apenas para ambiente local/homologação.",
    password: PASS,
    coach: { email: coachEmail, totp_secret: enrolled.totp.secret },
    adults: [ana.email, bruno.email, carla.email],
    guardian: guardianEmail,
    children: [clara.student_id, davi.student_id],
  };
  writeFileSync(".demo-credentials.json", JSON.stringify(creds, null, 2), { mode: 0o600 });
  console.log("Dados de demonstração criados. Credenciais em .demo-credentials.json");
  console.log(`Professor: ${coachEmail} / ${PASS} — código MFA: npx tsx scripts/totp.ts`);
}

main().catch((e) => {
  console.error("Falha no seed:", e?.message ?? e);
  process.exit(1);
});
