"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionForm, CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/card";
import { InviteLinkPanel } from "@/components/invite-link";
import { buttonClasses } from "@/components/ui/button";
import type { ActionState } from "@/lib/errors";
import { createStudentAction } from "./actions";

type SeriesOpt = { id: string; label: string; full: boolean };

export function NewStudentForm({ appUrl, guardians, series, defaultMonth, today }: {
  appUrl: string; guardians: { id: string; label: string }[]; series: SeriesOpt[]; defaultMonth: string; today: string;
}) {
  const [kind, setKind] = useState<"adult" | "child">("adult");
  const [guardianMode, setGuardianMode] = useState<"new" | "existing">("new");
  const [created, setCreated] = useState<ActionState<{ student_id: string; invitation: { token: string; expires_at: string } | null }> | null>(null);

  if (created?.ok && created.data) {
    const inv = created.data.invitation;
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader title="Aluno cadastrado" description="O cadastro, a mensalidade e os horários foram salvos." />
          {inv ? (
            <InviteLinkPanel url={`${appUrl}/convite#${inv.token}`} expiresAt={inv.expires_at} who={kind === "child" ? "o responsável" : "o aluno"} />
          ) : (
            <p className="text-sm text-muted">Nenhum convite foi gerado. Você pode gerar depois na ficha do aluno.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/professor/alunos/${created.data.student_id}`} className={buttonClasses("primary")}>Abrir ficha do aluno</Link>
            <button type="button" className={buttonClasses("secondary")} onClick={() => setCreated(null)}>Cadastrar outro</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <ActionForm action={createStudentAction} submitLabel="Cadastrar aluno" pendingLabel="Cadastrando…"
      onSuccess={(s) => setCreated(s as typeof created)}>
      <Card>
        <CardHeader title="Dados do aluno" />
        <div className="space-y-4">
          <fieldset>
            <legend className="label-caps mb-2 text-muted">Tipo</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["adult", "child"] as const).map((k) => (
                <label key={k} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-border-strong px-3 has-[:checked]:border-primary has-[:checked]:bg-info-bg">
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="size-4 accent-[var(--primary-strong)]" />
                  <span className="font-semibold">{k === "adult" ? "Adulto" : "Criança"}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <TextField name="full_name" label="Nome completo" required autoComplete="off" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="email" type="email" label={kind === "adult" ? "E-mail" : "E-mail (opcional)"} inputMode="email" autoComplete="off"
              hint={kind === "adult" ? "Usado para o convite de acesso." : undefined} />
            <TextField name="phone" type="tel" label="Telefone (opcional)" inputMode="tel" autoComplete="off" />
          </div>
          <TextField name="level" label="Nível (opcional)" placeholder="Ex.: iniciante, intermediário" />
          <TextAreaField name="private_note" label="Observação administrativa (privada)"
            hint="Visível apenas para o professor. Não registre dados sensíveis desnecessários." />
        </div>
      </Card>

      {kind === "child" ? (
        <Card>
          <CardHeader title="Responsável" description="Crianças não têm login próprio: o responsável acompanha pelo app." />
          <div className="space-y-4">
            {guardians.length > 0 ? (
              <fieldset>
                <legend className="label-caps mb-2 text-muted">Responsável</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["new", "existing"] as const).map((m) => (
                    <label key={m} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-border-strong px-3 has-[:checked]:border-primary has-[:checked]:bg-info-bg">
                      <input type="radio" name="guardian_mode" value={m} checked={guardianMode === m} onChange={() => setGuardianMode(m)} className="size-4 accent-[var(--primary-strong)]" />
                      <span className="text-sm font-semibold">{m === "new" ? "Novo responsável" : "Já cadastrado"}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : <input type="hidden" name="guardian_mode" value="new" />}
            {guardianMode === "existing" && guardians.length > 0 ? (
              <SelectField name="guardian_id" label="Responsável cadastrado" options={guardians.map((g) => ({ value: g.id, label: g.label }))} placeholder="Selecione" required />
            ) : (
              <>
                <TextField name="guardian_full_name" label="Nome do responsável" required />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField name="guardian_email" type="email" label="E-mail do responsável" inputMode="email" hint="Usado para o convite." />
                  <TextField name="guardian_phone" type="tel" label="Telefone do responsável" inputMode="tel" />
                </div>
                <TextField name="guardian_relationship" label="Parentesco (opcional)" placeholder="Ex.: mãe, pai, avó" />
              </>
            )}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Mensalidade (opcional)" description="Valor e vencimento individualizados. Dias 29–31 vencem no último dia de meses menores." />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField name="tuition_amount" label="Valor (R$)" inputMode="decimal" placeholder="250,00" />
          <TextField name="tuition_due_day" label="Dia de vencimento" type="number" min={1} max={31} placeholder="10" />
          <TextField name="tuition_start_month" label="A partir de" type="month" defaultValue={defaultMonth} min={defaultMonth} />
        </div>
        <p className="mt-2 text-xs text-muted">A primeira mensalidade é integral por padrão; ajustes são feitos depois, com justificativa.</p>
      </Card>

      <Card>
        <CardHeader title="Horários fixos (opcional)" description="Capacidade e conflitos são validados ao salvar." />
        {series.length === 0 ? (
          <p className="text-sm text-muted">Nenhum horário cadastrado ainda. <Link href="/professor/agenda/horarios/novo" className="font-semibold text-link">Criar horário</Link></p>
        ) : (
          <div className="space-y-2">
            {series.map((s) => (
              <CheckboxField key={s.id} name="series_ids" value={s.id} label={s.label} hint={s.full ? "Sem vagas no momento" : undefined} />
            ))}
            <TextField name="enroll_from" label="Início das aulas" type="date" defaultValue={today} min={today} />
          </div>
        )}
      </Card>

      <Card>
        <CheckboxField name="invite" label={kind === "child" ? "Gerar convite de acesso para o responsável" : "Gerar convite de acesso para o aluno"}
          hint="Você copia o link e envia manualmente. Envio automático por e-mail não está configurado nesta versão." />
      </Card>
    </ActionForm>
  );
}
