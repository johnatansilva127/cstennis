import { ActionForm, CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { Disclosure } from "@/components/ui/disclosure";
import { GenerateInviteButton, PasswordLinkButton } from "@/components/generate-invite";
import { env } from "@/lib/env";
import { formatDate, formatDateTime, isoToZonedLocal } from "@/lib/dates";
import { RESTRICTION_LEVEL, RESTRICTION_MODE } from "@/lib/labels";
import type { TabProps } from "./types";
import {
  createInviteAction, createOverrideAction, createPasswordLinkAction, linkGuardianAction, revokeAccessAction, revokeInviteAction, revokeOverrideAction,
  setPrivateNoteAction, setStatusAction, studentPolicyAction, unlinkGuardianAction, updateStudentAction,
} from "./actions";

export async function TabResumo({ studentId, student, supabase, today, tz }: TabProps) {
  const appUrl = env().APP_URL;
  const [link, invites, glinks, note, policies, overrides, restriction, allGuardians] = await Promise.all([
    supabase.from("student_user_links").select("id, created_at").eq("student_id", studentId).is("revoked_at", null).maybeSingle(),
    supabase.from("invitations").select("id, kind, student_id, guardian_id, email, expires_at").eq("status", "pending"),
    supabase.from("guardian_student_links").select("id, relationship, created_at, guardians(id, full_name, email, phone, user_id)")
      .eq("student_id", studentId).is("revoked_at", null),
    supabase.from("student_private_notes").select("note, updated_at").eq("student_id", studentId).maybeSingle(),
    supabase.from("access_policies").select("student_id, mode, grace_days"),
    supabase.from("access_overrides").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(10),
    supabase.rpc("student_restriction", { p_student_id: studentId }),
    supabase.from("guardians").select("id, full_name, email").eq("status", "active").order("full_name"),
  ]);
  const now = new Date().toISOString();
  const pendingInvite = (invites.data ?? []).find((i) => i.student_id === studentId && i.expires_at > now);
  type GL = { id: string; relationship: string | null; created_at: string; guardians: { id: string; full_name: string; email: string | null; phone: string | null; user_id: string | null } };
  const guardians = (glinks.data ?? []) as unknown as GL[];
  const studentPolicy = (policies.data ?? []).find((p) => p.student_id === studentId);
  const orgPolicy = (policies.data ?? []).find((p) => p.student_id === null);
  const r = restriction.data as { level: string; overdue_count: number; effective_from: string | null; override_kind: string | null; override_expires_at: string | null } | null;
  const activeOverrides = (overrides.data ?? []).filter((o) => !o.revoked_at && (!o.expires_at || o.expires_at > now));
  const anonymized = !!student.anonymized_at;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Dados de contato" />
        {anonymized ? <Alert tone="neutral">Cadastro anonimizado em {formatDateTime(student.anonymized_at, tz)}.</Alert> : (
          <ActionForm action={updateStudentAction.bind(null, studentId)} submitLabel="Salvar dados">
            <TextField name="full_name" label="Nome completo" defaultValue={student.full_name} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="email" type="email" label="E-mail" defaultValue={student.email} inputMode="email" />
              <TextField name="phone" type="tel" label="Telefone" defaultValue={student.phone} inputMode="tel" />
            </div>
            <TextField name="level" label="Nível" defaultValue={student.level} />
          </ActionForm>
        )}
      </Card>

      <Card>
        <CardHeader title="Acesso ao app" description={student.kind === "child" ? "Crianças são acompanhadas pelos responsáveis vinculados." : undefined} />
        {student.kind === "adult" ? (
          <div className="space-y-3">
            {link.data ? (
              <>
                <StatusBadge tone="success">Conta ativa desde {formatDate(link.data.created_at.slice(0, 10))}</StatusBadge>
                <PasswordLinkButton action={createPasswordLinkAction.bind(null, "student", studentId)} who="o aluno" />
                <Disclosure summary="Revogar acesso do aluno">
                  <ActionForm action={revokeAccessAction.bind(null, "student", studentId)} submitLabel="Revogar acesso" submitVariant="danger"
                    confirm="Revogar o acesso deste aluno? O histórico é mantido.">
                    <TextField name="reason" label="Motivo" required />
                  </ActionForm>
                </Disclosure>
              </>
            ) : pendingInvite ? (
              <div className="space-y-2">
                <StatusBadge tone="info">Convite pendente até {formatDateTime(pendingInvite.expires_at, tz)}</StatusBadge>
                <p className="text-sm text-muted">Enviado para {pendingInvite.email}.</p>
                <div className="flex flex-wrap gap-2">
                  <GenerateInviteButton action={createInviteAction.bind(null, "student", studentId)} appUrl={appUrl} who="o aluno" label="Gerar novo link" />
                  <ActionForm action={revokeInviteAction.bind(null, pendingInvite.id)} submitLabel="Cancelar convite" submitVariant="secondary" submitFull={false}>
                    <span className="sr-only">Cancelar convite pendente</span>
                  </ActionForm>
                </div>
              </div>
            ) : !anonymized && student.status !== "archived" ? (
              <>
                <p className="text-sm text-muted">{student.email ? `O convite será vinculado a ${student.email}.` : "Cadastre um e-mail para gerar convite."}</p>
                {student.email ? <GenerateInviteButton action={createInviteAction.bind(null, "student", studentId)} appUrl={appUrl} who="o aluno" /> : null}
              </>
            ) : <p className="text-sm text-muted">Sem acesso.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {guardians.length === 0 ? <Alert tone="warning">Nenhum responsável vinculado.</Alert> : null}
            {guardians.map((g) => {
              const inv = (invites.data ?? []).find((i) => i.guardian_id === g.guardians.id && i.expires_at > now);
              return (
                <div key={g.id} className="space-y-2 rounded-xl border border-border p-3">
                  <p className="font-semibold">{g.guardians.full_name}{g.relationship ? <span className="font-normal text-muted"> · {g.relationship}</span> : null}</p>
                  <p className="text-sm text-muted">{[g.guardians.email, g.guardians.phone].filter(Boolean).join(" · ")}</p>
                  {g.guardians.user_id ? <StatusBadge tone="success">Com acesso ativo</StatusBadge>
                    : inv ? <StatusBadge tone="info">Convite pendente até {formatDateTime(inv.expires_at, tz)}</StatusBadge>
                      : <StatusBadge tone="neutral">Sem acesso</StatusBadge>}
                  <div className="flex flex-wrap gap-2">
                    {!g.guardians.user_id && g.guardians.email ? (
                      <GenerateInviteButton action={createInviteAction.bind(null, "guardian", g.guardians.id)} appUrl={appUrl}
                        who={g.guardians.full_name} label={inv ? "Gerar novo link" : "Gerar convite"} />
                    ) : null}
                    {g.guardians.user_id ? (
                      <PasswordLinkButton action={createPasswordLinkAction.bind(null, "guardian", g.guardians.id)} who={g.guardians.full_name} />
                    ) : null}
                  </div>
                  <Disclosure summary="Revogar vínculo com esta criança">
                    <ActionForm action={unlinkGuardianAction.bind(null, g.id)} submitLabel="Revogar vínculo" submitVariant="danger"
                      confirm="O responsável deixará de ver os dados desta criança. Continuar?">
                      <TextField name="reason" label="Motivo" required />
                    </ActionForm>
                  </Disclosure>
                </div>
              );
            })}
            <Disclosure summary="Vincular responsável">
              <ActionForm action={linkGuardianAction.bind(null, studentId)} submitLabel="Vincular" resetOnSuccess>
                <SelectField name="guardian_id" label="Responsável já cadastrado" placeholder="— Cadastrar novo abaixo —"
                  options={(allGuardians.data ?? []).filter((x) => !guardians.some((g) => g.guardians.id === x.id))
                    .map((x) => ({ value: x.id, label: `${x.full_name}${x.email ? ` (${x.email})` : ""}` }))} />
                <p className="text-xs text-muted">Ou cadastre um novo responsável:</p>
                <TextField name="guardian_full_name" label="Nome" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField name="guardian_email" type="email" label="E-mail" />
                  <TextField name="guardian_phone" type="tel" label="Telefone" />
                </div>
                <TextField name="relationship" label="Parentesco (opcional)" />
              </ActionForm>
            </Disclosure>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Restrição financeira"
          description={`Regra geral: ${RESTRICTION_MODE[orgPolicy?.mode ?? "warn_only"].label}, ${orgPolicy?.grace_days ?? 0} dia(s) de tolerância.`} />
        {r ? (
          <Alert tone={RESTRICTION_LEVEL[r.level].tone} title={RESTRICTION_LEVEL[r.level].label} className="mb-3">
            {RESTRICTION_LEVEL[r.level].description}
            {r.overdue_count > 0 && r.effective_from ? ` Bloqueio (se aplicável) vale a partir de ${formatDate(r.effective_from)}.` : ""}
            {r.override_kind ? ` Regra manual ativa${r.override_expires_at ? ` até ${formatDateTime(r.override_expires_at, tz)}` : ""}.` : ""}
          </Alert>
        ) : null}
        <div className="space-y-3">
          <Disclosure summary="Regra específica deste aluno">
            <ActionForm action={studentPolicyAction.bind(null, studentId)} submitLabel="Salvar regra">
              <SelectField name="mode" label="Regra" defaultValue={studentPolicy?.mode ?? ""} placeholder="Seguir a regra geral"
                options={Object.entries(RESTRICTION_MODE).map(([value, v]) => ({ value, label: v.label }))} />
              <TextField name="grace_days" type="number" min={0} max={60} label="Dias de tolerância" defaultValue={studentPolicy?.grace_days ?? 0} />
            </ActionForm>
          </Disclosure>
          <Disclosure summary="Liberar ou bloquear manualmente">
            <ActionForm action={createOverrideAction.bind(null, studentId, tz)} submitLabel="Registrar" resetOnSuccess>
              <SelectField name="kind" label="Tipo" required placeholder="Selecione" options={[
                { value: "release", label: "Liberação temporária (com prazo)" },
                { value: "block_requests", label: "Bloquear novos pedidos de vaga" },
                { value: "restrict_modules", label: "Restringir aulas e evolução" },
              ]} />
              <TextField name="reason" label="Motivo" required />
              <TextField name="expires_at" type="datetime-local" label="Válida até" min={isoToZonedLocal(new Date().toISOString(), tz)}
                hint="Obrigatório para liberação (máx. 90 dias). Ao expirar, a regra normal volta a valer." />
            </ActionForm>
          </Disclosure>
          {activeOverrides.length > 0 ? (
            <ul className="space-y-2">
              {activeOverrides.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                  <span>
                    <strong>{o.kind === "release" ? "Liberação" : o.kind === "block_requests" ? "Pedidos bloqueados" : "Módulos restritos"}</strong>
                    {" · "}{o.reason}{o.expires_at ? ` · até ${formatDateTime(o.expires_at, tz)}` : ""}
                  </span>
                  <ActionForm action={revokeOverrideAction.bind(null, o.id)} submitLabel="Revogar" submitVariant="secondary" submitFull={false}>
                    <span className="sr-only">Revogar regra manual</span>
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Situação cadastral" description="Arquivar não apaga histórico nem pagamentos." />
        <ActionForm action={setStatusAction.bind(null, studentId)} submitLabel="Atualizar situação">
          <SelectField name="status" label="Nova situação" defaultValue={student.status} options={[
            { value: "active", label: "Ativo" }, { value: "paused", label: "Pausado" }, { value: "archived", label: "Arquivado" },
          ]} />
          <TextField name="effective_date" type="date" label="A partir de" defaultValue={today} required
            hint="Cobranças: o aluno paga a competência se estiver ativo no 1º dia do mês." />
          <TextField name="reason" label="Motivo (opcional)" />
          <CheckboxField name="end_enrollments" label="Encerrar vagas fixas a partir desta data" defaultChecked
            hint="Recomendado ao pausar ou arquivar. Aulas passadas não são alteradas." />
        </ActionForm>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Observação administrativa (privada)" description="Nunca é exibida ao aluno ou responsável." />
        <ActionForm action={setPrivateNoteAction.bind(null, studentId)} submitLabel="Salvar observação">
          <TextAreaField name="note" label="Observação" defaultValue={note.data?.note ?? ""} rows={4} />
        </ActionForm>
      </Card>
    </div>
  );
}
