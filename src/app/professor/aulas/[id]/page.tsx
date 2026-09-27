import type { Metadata } from "next";
import { requestNow } from "@/lib/clock";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import { endTime, formatDateLong, formatDateTime, formatTime, todayInTz } from "@/lib/dates";
import { FORMAT_LABEL, OCCURRENCE_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionForm, SelectField, TextField } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { AttendanceForm } from "./attendance-form";
import { cancelOccurrenceAction, restoreOccurrenceAction, updateOccurrenceAction } from "../../agenda/actions";

export const metadata: Metadata = { title: "Aula" };

export default async function OccurrencePage({ params }: PageProps<"/professor/aulas/[id]">) {
  const { id } = await params;
  const { supabase, org } = await requireCoach();
  const { data: o } = await supabase.from("lesson_occurrences").select("*, locations(name, address), courts(name), recurring_slots(title)")
    .eq("id", id).maybeSingle();
  if (!o) notFound();
  const [{ data: roster }, { data: locations }] = await Promise.all([
    supabase.rpc("occurrence_attendance", { p_occurrence_id: id }),
    supabase.from("locations").select("id, name, courts(id, name, active)").eq("active", true).order("name"),
  ]);
  const now = requestNow();
  const startsAt = new Date(o.starts_at).getTime();
  const canMark = o.status !== "cancelled" && startsAt <= now + 30 * 60000;
  const future = o.status === "scheduled" && startsAt > now;
  const today = todayInTz(org.timezone);
  const courts = (locations ?? []).flatMap((l) => (l.courts ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: `${l.name} · ${c.name}` })));

  return (
    <>
      <PageHeader back={{ href: `/professor/agenda?data=${o.local_date}`, label: "Agenda" }}
        eyebrow={formatDateLong(o.local_date)}
        title={`${formatTime(o.start_time)}–${endTime(o.start_time, o.duration_minutes)} · ${o.recurring_slots?.title ?? FORMAT_LABEL[o.format]}`}
        description={<span className="inline-flex items-center gap-1"><MapPin aria-hidden className="size-4" />{o.locations?.name}{o.courts?.name ? ` · ${o.courts.name}` : ""}{o.locations?.address ? ` · ${o.locations.address}` : ""}</span>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge tone={OCCURRENCE_STATUS[o.status].tone}>{OCCURRENCE_STATUS[o.status].label}</StatusBadge>
        {o.is_exception && o.status === "scheduled" ? <StatusBadge tone="info">Remarcada individualmente</StatusBadge> : null}
        {o.local_date !== o.original_date ? <StatusBadge tone="neutral">Data original {o.original_date.split("-").reverse().join("/")}</StatusBadge> : null}
      </div>
      {o.status === "cancelled" ? <Alert tone="danger" title="Aula cancelada" className="mb-4">{o.cancel_reason} {o.cancelled_at ? `· ${formatDateTime(o.cancelled_at, org.timezone)}` : ""}</Alert> : null}
      {o.exception_note ? <Alert tone="info" className="mb-4">{o.exception_note}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Chamada" description={`${(roster ?? []).length} aluno(s) nesta aula`} />
          {(roster ?? []).length === 0 ? <EmptyState title="Nenhum aluno matriculado nesta data" /> : canMark ? (
            <AttendanceForm occurrenceId={id} roster={(roster ?? []).map((r) => ({ student_id: r.student_id, full_name: r.full_name, status: r.status }))} />
          ) : (
            <>
              <ul className="mb-3 divide-y divide-border text-sm">{(roster ?? []).map((r) => <li key={r.student_id} className="py-2">{r.full_name}</li>)}</ul>
              <p className="text-sm text-muted">{o.status === "cancelled" ? "Aula cancelada não tem chamada." : "A chamada abre 30 minutos antes do início."}</p>
            </>
          )}
        </Card>
        <div className="space-y-4">
          {future ? (
            <>
              <Card>
                <Disclosure summary="Remarcar só esta aula">
                  <ActionForm action={updateOccurrenceAction.bind(null, id)} submitLabel="Remarcar">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField name="local_date" type="date" label="Data" defaultValue={o.local_date} min={today} required />
                      <TextField name="start_time" type="time" label="Início" defaultValue={o.start_time.slice(0, 5)} required />
                    </div>
                    <TextField name="duration_minutes" type="number" min={15} max={300} label="Duração (min)" defaultValue={o.duration_minutes} required />
                    <SelectField name="location_id" label="Local" defaultValue={o.location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} />
                    <SelectField name="court_id" label="Quadra" defaultValue={o.court_id ?? ""} placeholder="Sem quadra definida" options={courts}
                      hint="A quadra precisa pertencer ao local escolhido." />
                    <TextField name="note" label="Aviso aos alunos (opcional)" />
                  </ActionForm>
                </Disclosure>
              </Card>
            </>
          ) : null}
          {o.status === "scheduled" ? (
            <Card>
              <Disclosure summary="Cancelar esta aula">
                <ActionForm action={cancelOccurrenceAction.bind(null, id)} submitLabel="Cancelar aula" submitVariant="danger"
                  confirm="Cancelar a aula e avisar os alunos? Não há crédito ou reposição automática.">
                  <TextField name="reason" label="Motivo (visível aos alunos)" required />
                </ActionForm>
              </Disclosure>
            </Card>
          ) : null}
          {o.status === "cancelled" && startsAt > now ? (
            <Card>
              <ActionForm action={restoreOccurrenceAction.bind(null, id)} submitLabel="Reativar aula" submitVariant="secondary">
                <p className="text-sm text-muted">Reativar valida novamente conflitos de agenda e avisa os alunos.</p>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
