"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { actionAuth, isAuthed } from "@/lib/auth";
import { str } from "@/lib/actions";
import { fromDbError, type ActionState } from "@/lib/errors";
import { stepUpWithCode } from "@/lib/mfa";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function anonymizeAction(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await actionAuth("coach");
  if (!isAuthed(auth)) return auth;
  if (str(fd, "confirm") !== "ANONIMIZAR") return { ok: false, fieldErrors: { confirm: "Digite ANONIMIZAR para confirmar." } };
  if (str(fd, "reason").length < 3) return { ok: false, fieldErrors: { reason: "Informe o motivo/solicitação." } };
  const sb = auth.supabase as unknown as SupabaseClient;
  const step = await stepUpWithCode(sb, str(fd, "mfa_code"));
  if (step) return step;
  const { data, error } = await sb.rpc("anonymize_student", { p_student_id: studentId, p_reason: str(fd, "reason") });
  if (error) return fromDbError(error);
  // Remove os arquivos de comprovantes do storage e confirma no banco.
  const admin = createSupabaseAdminClient();
  const files = (data as { files: { file_id: string; bucket: string; object_path: string }[] }).files;
  let removed = 0;
  for (const f of files) {
    const { error: rmErr } = await admin.storage.from(f.bucket).remove([f.object_path]);
    if (!rmErr) {
      await admin.rpc("mark_file_deleted", { p_file_id: f.file_id, p_reason: "anonymization" });
      removed++;
    }
  }
  return {
    ok: true,
    message: `Cadastro anonimizado. ${removed} de ${files.length} arquivo(s) removido(s) do armazenamento. Cópias em backups expiram conforme a política de retenção de backups.`,
  };
}
