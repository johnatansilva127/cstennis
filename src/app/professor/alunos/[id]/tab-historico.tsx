import { Card, CardHeader } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionForm, TextField } from "@/components/ui/form";
import { Alert } from "@/components/ui/status";
import { buttonClasses } from "@/components/ui/button";
import { anonymizeAction } from "./privacy-actions";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/dates";
import type { TabProps } from "./types";

const ACTIONS: Record<string, string> = {
  "student.create": "Cadastro criado", "student.update": "Dados alterados", "student.status": "Situação alterada",
  "invitation.create": "Convite gerado", "invitation.accept": "Convite aceito", "invitation.revoke": "Convite revogado",
  "invitation.wrong_recipient": "Tentativa de aceite com outra conta", "guardian_link.create": "Responsável vinculado",
  "guardian_link.revoke": "Vínculo de responsável revogado", "student_access.revoke": "Acesso revogado",
  "enrollment.create": "Matrícula criada", "enrollment.end": "Matrícula encerrada", "enrollment_request.create": "Pedido de vaga",
  "enrollment_request.decide": "Pedido decidido", "enrollment_request.cancel": "Pedido cancelado",
  "attendance.mark": "Presença marcada", "attendance.change": "Presença alterada", "attendance.clear": "Presença removida",
  "tuition.set": "Plano de mensalidade definido", "tuition.end": "Plano encerrado", "invoice.create_manual": "Cobrança avulsa",
  "invoice.adjust": "Cobrança ajustada", "invoice.cancel": "Cobrança cancelada", "payment_submission.received": "Comprovante recebido",
  "payment_submission.reject": "Comprovante rejeitado", "payment_submission.withdraw": "Envio cancelado pelo pagador",
  "payment.approve_submission": "Pagamento confirmado (comprovante)", "payment.manual": "Baixa manual", "payment.reverse": "Estorno",
  "access_policy.student": "Regra de restrição alterada", "access_override.create": "Liberação/bloqueio manual",
  "access_override.revoke": "Liberação/bloqueio revogado", "assessment.create": "Avaliação criada", "assessment.update": "Avaliação alterada",
  "assessment.publish": "Avaliação publicada", "assessment.delete_draft": "Rascunho apagado", "goal.create": "Meta criada",
  "goal.update": "Meta alterada", "match.create": "Jogo registrado", "match.update": "Jogo editado", "match.delete": "Jogo apagado",
  "match_comment.create": "Comentário em jogo", "file.download": "Comprovante aberto", "file.infected": "Arquivo bloqueado pelo antimalware",
  "student.export": "Dados exportados", "student.anonymize": "Cadastro anonimizado", "privacy_request.create": "Solicitação de privacidade",
};

export async function TabHistorico({ studentId, student, supabase, tz }: TabProps) {
  const { data } = await supabase.from("audit_events").select("id, action, actor_role, created_at")
    .eq("student_id", studentId).order("created_at", { ascending: false }).limit(100);
  return (
    <div className="space-y-5">
    <Card>
      <CardHeader title="Dados pessoais" description="Atendimento a pedidos de acesso, exportação ou exclusão." />
      <div className="space-y-3">
        <Disclosure summary="Exportar todos os dados (JSON)">
          <form action={`/api/exportar/${studentId}`} method="post" className="space-y-3">
            <label htmlFor="export-mfa" className="label-caps block text-muted">Código do autenticador</label>
            <input id="export-mfa" name="mfa_code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
              className="block min-h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5" />
            <button type="submit" className={buttonClasses("secondary")}>Baixar exportação</button>
            <p className="text-xs text-muted">Inclui observações privadas do professor. Trate o arquivo com cuidado.</p>
          </form>
        </Disclosure>
        {student.status === "archived" && !student.anonymized_at ? (
          <Disclosure summary="Anonimizar cadastro (exclusão de dados pessoais)">
            <Alert tone="warning" className="mb-3">
              Remove nome, contatos, textos livres e arquivos de comprovantes. Valores, datas de cobranças/pagamentos e presenças
              permanecem vinculados a um cadastro anônimo. Ação irreversível.
            </Alert>
            <ActionForm action={anonymizeAction.bind(null, studentId)} submitLabel="Anonimizar" submitVariant="danger">
              <TextField name="reason" label="Motivo / referência da solicitação" required />
              <TextField name="confirm" label="Digite ANONIMIZAR" required autoComplete="off" />
              <TextField name="mfa_code" label="Código do autenticador" inputMode="numeric" maxLength={6} required />
            </ActionForm>
          </Disclosure>
        ) : student.anonymized_at ? <Alert tone="neutral">Cadastro anonimizado.</Alert>
          : <p className="text-sm text-muted">Para anonimizar, arquive o aluno primeiro (aba Resumo).</p>}
      </div>
    </Card>
    <Card>
      <CardHeader title="Trilha de auditoria" description="Registros imutáveis de alterações relevantes (sem senhas, tokens ou arquivos)." />
      {(data ?? []).length === 0 ? <EmptyState title="Sem registros" /> : (
        <ol className="divide-y divide-border text-sm">
          {(data ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium">{ACTIONS[e.action] ?? e.action}</span>
              <span className="text-muted">{e.actor_role === "coach" ? "Professor" : e.actor_role === "system" ? "Sistema" : "Aluno/responsável"} · {formatDateTime(e.created_at, tz)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
    </div>
  );
}
