"use server";

import { after } from "next/server";
import { getClaims, getSupabase } from "@/lib/auth";
import { runRpc } from "@/lib/actions";
import { dbErrorMessage, logServerError, type ActionState } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MAX_PROOF_BYTES, validateProof } from "@/lib/files/validate";
import { scanBuffer } from "@/lib/files/scan";
import { rateLimit } from "@/lib/rate-limit";

const DECLARED: Record<string, "jpeg" | "png" | "pdf"> = { "image/jpeg": "jpeg", "image/png": "png", "application/pdf": "pdf" };

export async function prepareUploadAction(invoiceId: string, meta: { size: number; type: string; note?: string }):
  Promise<ActionState<{ fileId: string; signedUrl: string }>> {
  const claims = await getClaims();
  if (!claims) return { ok: false, message: "Sessão expirada. Entre novamente." };
  const detected = DECLARED[meta.type];
  if (!detected) return { ok: false, message: "Envie uma imagem JPEG/PNG ou um PDF." };
  if (!Number.isInteger(meta.size) || meta.size <= 0 || meta.size > MAX_PROOF_BYTES) return { ok: false, message: "O arquivo precisa ter até 10 MB." };
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("begin_payment_submission", {
    p_invoice_id: invoiceId, p_detected_type: detected, p_mime_type: meta.type, p_size_bytes: meta.size,
    p_sha256: null as unknown as string, p_width: null as unknown as number, p_height: null as unknown as number,
    p_note: (meta.note ?? "").slice(0, 500) || (null as unknown as string),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const begin = data as { file_id: string; bucket: string; object_path: string };
  const admin = createSupabaseAdminClient();
  const { data: signed, error: signErr } = await admin.storage.from(begin.bucket).createSignedUploadUrl(begin.object_path, { upsert: false });
  if (signErr || !signed) {
    await admin.rpc("fail_payment_submission_upload", { p_file_id: begin.file_id, p_reason: "signed_url_failed" });
    return { ok: false, message: "Não foi possível preparar o envio. Tente novamente." };
  }
  return { ok: true, data: { fileId: begin.file_id, signedUrl: signed.signedUrl } };
}

async function reject(admin: ReturnType<typeof createSupabaseAdminClient>, file: { id: string; bucket: string; object_path: string }, reason: string, code: string) {
  await admin.storage.from(file.bucket).remove([file.object_path]);
  await admin.rpc("fail_payment_submission_upload", { p_file_id: file.id, p_reason: code });
  // Registro da rejeição sem o conteúdo do arquivo.
  console.warn(JSON.stringify({ level: "warn", event: "upload_rejected", code }));
  return { ok: false, message: reason };
}

export async function finalizeUploadAction(fileId: string, fileName: string): Promise<ActionState<{ status: string }>> {
  const claims = await getClaims();
  if (!claims) return { ok: false, message: "Sessão expirada. Entre novamente." };
  if (!(await rateLimit("upload:finalize", claims.sub, 20, 3600))) return { ok: false, message: "Muitas tentativas. Aguarde." };
  const supabase = await getSupabase();
  // Visível via RLS apenas para quem tem vínculo com o aluno; exige ser o autor do envio.
  const { data: file } = await supabase.from("file_objects").select("id, bucket, object_path, mime_type, detected_type, status, uploaded_by")
    .eq("id", fileId).maybeSingle();
  if (!file || file.uploaded_by !== claims.sub || file.status !== "pending_upload") return { ok: false, message: "Envio não encontrado." };
  const admin = createSupabaseAdminClient();
  const { data: blob, error: dlErr } = await admin.storage.from(file.bucket).download(file.object_path);
  if (dlErr || !blob) return reject(admin, file, "O arquivo não chegou ao servidor. Tente enviar novamente.", "missing_object");
  if (blob.size > MAX_PROOF_BYTES) return reject(admin, file, "Arquivo maior que 10 MB.", "too_large");
  const bytes = Buffer.from(await blob.arrayBuffer());
  const result = await validateProof(bytes, fileName);
  if (!result.ok) return reject(admin, file, result.reason, result.code);
  if (result.type !== file.detected_type || result.mime !== file.mime_type || (blob.type && blob.type !== file.mime_type)) {
    return reject(admin, file, "O conteúdo do arquivo não corresponde ao tipo informado.", "type_mismatch");
  }
  const scan = await scanBuffer(bytes);
  const { data: status, error } = await admin.rpc("complete_payment_submission_upload", {
    p_file_id: file.id, p_scan_status: scan.status, p_scan_engine: scan.engine, p_sha256: result.sha256,
    p_size_bytes: result.size, p_width: result.width ?? (null as unknown as number), p_height: result.height ?? (null as unknown as number),
  });
  if (error) {
    logServerError("upload.complete", error);
    return { ok: false, message: "Não foi possível registrar o comprovante. Tente novamente." };
  }
  if (scan.status === "infected") {
    await admin.storage.from(file.bucket).remove([file.object_path]);
    await admin.rpc("mark_file_deleted", { p_file_id: file.id, p_reason: "infected" });
  }
  // Entrega rápida dos avisos (o cron também processa a fila).
  after(async () => {
    await admin.rpc("run_jobs_now", { p_job: "frequent" });
  });
  if (status === "rejected") {
    return { ok: false, message: scan.status === "infected" ? "O arquivo foi recusado pela verificação de segurança. Envie outro arquivo." : "A cobrança não aceita mais comprovantes." };
  }
  return {
    ok: true, data: { status: String(status) },
    message: scan.status === "clean"
      ? "Comprovante enviado! O professor vai conferir no banco. O envio não confirma o pagamento automaticamente."
      : "Comprovante recebido e em verificação de segurança. O professor vai conferir no banco.",
  };
}

export async function withdrawSubmissionAction(submissionId: string, _: ActionState): Promise<ActionState> {
  return runRpc("participant", "withdraw_payment_submission", { p_submission_id: submissionId }, { success: "Envio cancelado. Você pode enviar outro arquivo." });
}
