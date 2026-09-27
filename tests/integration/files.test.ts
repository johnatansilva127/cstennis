import { beforeAll, describe, expect, it } from "vitest";
import { admin, anonClient, createLinkedAdult, rpc, rpcError, setupOrg, sql, type Org, type Session } from "../helpers/db";
import { testEnv } from "../helpers/env";
import { createHash } from "node:crypto";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a1d3a4d10000000049454e44ae426082",
  "hex");

async function uploadProof(session: Session, invoiceId: string, scan: "clean" | "pending" | "infected") {
  const sha = createHash("sha256").update(PNG).digest("hex");
  const begin = await rpc<{ submission_id: string; file_id: string; bucket: string; object_path: string }>(
    session, "begin_payment_submission", {
      p_invoice_id: invoiceId, p_detected_type: "png", p_mime_type: "image/png", p_size_bytes: PNG.length, p_sha256: sha });
  const { error } = await admin.storage.from(begin.bucket).upload(begin.object_path, PNG, { contentType: "image/png" });
  if (error) throw error;
  await rpc(admin, "complete_payment_submission_upload", { p_file_id: begin.file_id, p_scan_status: scan, p_scan_engine: "teste" });
  return begin;
}

describe("Comprovantes e arquivos privados (critério 13)", () => {
  let org: Org;
  let a: { studentId: string; session: Session };
  let b: { studentId: string; session: Session };
  let invoiceA: string;
  let invoiceB: string;

  beforeAll(async () => {
    org = await setupOrg();
    a = await createLinkedAdult(org, { tuition: { amount_cents: 10000, due_day: 28 } });
    b = await createLinkedAdult(org, { tuition: { amount_cents: 10000, due_day: 28 } });
    await rpc(org.coach, "generate_invoices_now");
    invoiceA = (await sql<{ id: string }>("select id from public.invoices where student_id = $1 order by competence limit 1", [a.studentId]))[0].id;
    invoiceB = (await sql<{ id: string }>("select id from public.invoices where student_id = $1 order by competence limit 1", [b.studentId]))[0].id;
  });

  it("bucket é privado: sem URL pública nem acesso direto de usuários", async () => {
    const bucket = await sql<{ public: boolean }>("select public from storage.buckets where id = 'payment-proofs'");
    expect(bucket[0].public).toBe(false);
    const up = await uploadProof(a.session, invoiceA, "clean");
    const env = testEnv();
    const pub = await fetch(`${env.url}/storage/v1/object/public/payment-proofs/${up.object_path}`);
    expect(pub.ok).toBe(false);
    const own = await a.session.client.storage.from("payment-proofs").download(up.object_path);
    expect(own.error).not.toBeNull();
    const coachDirect = await org.coach.client.storage.from("payment-proofs").download(up.object_path);
    expect(coachDirect.error).not.toBeNull();
    const list = await a.session.client.storage.from("payment-proofs").list(`proofs/${org.orgId}`);
    expect(list.data ?? []).toEqual([]);
    const directUpload = await a.session.client.storage.from("payment-proofs").upload(`proofs/${org.orgId}/x.png`, PNG, { contentType: "image/png" });
    expect(directUpload.error).not.toBeNull();
    const anonUp = await anonClient().storage.from("payment-proofs").upload(`proofs/${org.orgId}/y.png`, PNG);
    expect(anonUp.error).not.toBeNull();
  });

  it("URL assinada é emitida só após autorização e expira", async () => {
    await rpc(org.coach, "review_payment_submission", {
      p_submission_id: (await sql<{ id: string }>("select id from public.payment_submissions where invoice_id = $1", [invoiceA]))[0].id,
      p_action: "reject", p_reason: "Teste" });
    const up = await uploadProof(a.session, invoiceA, "clean");
    const auth = await rpc<{ allowed: boolean; bucket: string; object_path: string }>(a.session, "authorize_file_download", { p_file_id: up.file_id });
    expect(auth.allowed).toBe(true);
    const signed = await admin.storage.from(auth.bucket).createSignedUrl(auth.object_path, 1);
    const ok = await fetch(signed.data!.signedUrl);
    expect(ok.status).toBe(200);
    await new Promise((r) => setTimeout(r, 2500));
    const expired = await fetch(signed.data!.signedUrl);
    expect(expired.ok).toBe(false);

    // Outro aluno não obtém autorização (nem sabe se o arquivo existe).
    const err = await rpcError(b.session, "authorize_file_download", { p_file_id: up.file_id });
    expect(err.code).toBe("CS404");
    const coach = await rpc<{ allowed: boolean }>(org.coach, "authorize_file_download", { p_file_id: up.file_id });
    expect(coach.allowed).toBe(true);
    const audit = await sql("select 1 from public.audit_events where action = 'file.download' and entity_id = $1", [up.file_id]);
    expect(audit.length).toBeGreaterThan(0);
  });

  it("arquivos em quarentena ou infectados não ficam acessíveis", async () => {
    const pending = await uploadProof(b.session, invoiceB, "pending");
    const res = await rpc<{ allowed: boolean; reason: string }>(org.coach, "authorize_file_download", { p_file_id: pending.file_id });
    expect(res).toEqual({ allowed: false, reason: "pending" });
    await rpc(admin, "set_file_scan_result", { p_file_id: pending.file_id, p_scan_status: "infected", p_scan_engine: "ClamAV" });
    const res2 = await rpc<{ allowed: boolean; reason: string }>(org.coach, "authorize_file_download", { p_file_id: pending.file_id });
    expect(res2).toEqual({ allowed: false, reason: "infected" });
    const sub = await sql<{ status: string; rejection_reason: string }>(
      "select status, rejection_reason from public.payment_submissions where file_id = $1", [pending.file_id]);
    expect(sub[0].status).toBe("rejected");
    const inv = await sql<{ status: string }>("select status from public.invoices where id = $1", [invoiceB]);
    expect(inv[0].status).toBe("open");
  });

  it("tipos e tamanhos inválidos são recusados pelo banco", async () => {
    const bad = [
      { p_detected_type: "svg", p_mime_type: "image/svg+xml", p_size_bytes: 100 },
      { p_detected_type: "png", p_mime_type: "application/pdf", p_size_bytes: 100 },
      { p_detected_type: "pdf", p_mime_type: "application/pdf", p_size_bytes: 10 * 1024 * 1024 + 1 },
      { p_detected_type: "png", p_mime_type: "image/png", p_size_bytes: 0 },
    ];
    for (const args of bad) {
      const err = await rpcError(b.session, "begin_payment_submission", { p_invoice_id: invoiceB, p_sha256: "a".repeat(64), ...args });
      expect(err.code).toBe("CS422");
    }
  });
});
