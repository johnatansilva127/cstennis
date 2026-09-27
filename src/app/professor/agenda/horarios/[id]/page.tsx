import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth";
import { endTime, formatDate, formatShortDate, formatTime, todayInTz, weekdayLabel } from "@/lib/dates";
import { FORMAT_LABEL, OCCURRENCE_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionForm, TextField } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { SeriesEditForm } from "./series-edit";
import { endSeriesAction } from "../../actions";

export const metadata: Metadata = { title: "Horário fixo" };

export default async function SeriesPage({ params }: PageProps<"/professor/agenda/horarios/[id]">) {
  const { id } = await params;
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const { data: s } = await supabase.from("recurring_slots").select("*, locations(name), courts(name)").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [versions, enrollments, occurrences, locations, orgRow] = await Promise.all([
    supabase.from("recurring_slots").select("id, valid_from, valid_until, weekday, start_time, duration_minutes, format, capacity")
      .eq("series_root_id", s.series_root_id).order("valid_from"),
    supabase.from("enrollments").select("id, valid_from, valid_until, students(id, full_name)").eq("series_root_id", s.series_root_id)
      .eq("status", "active").or(`valid_until.is.null,valid_until.gte.${today}`).order("valid_from"),
    supabase.from("lesson_occurrences").select("id, local_date, start_time, status, is_exception, cancel_reason")
      .eq("series_root_id", s.series_root_id).gte("local_date", today).order("local_date").limit(8),
    supabase.from("locations").select("id, name, courts(id, name, active)").eq("active", true).order("name"),
    supabase.from("organizations").select("default_travel_buffer_minutes").single(),
  ]);
  const editable = !s.valid_until || s.valid_until >= today;
  const latest = (versions.data ?? []).at(-1);
  type E = { id: string; valid_from: string; valid_until: string | null; students: { id: string; full_name: string } };

  return (
    <>
      <PageHeader back={{ href: "/professor/agenda/horarios", label: "Horários fixos" }}
        eyebrow={`${weekdayLabel(s.weekday)} · ${formatTime(s.start_time)}–${endTime(s.start_time, s.duration_minutes)}`}
        title={s.title ?? FORMAT_LABEL[s.format]}
        description={`${s.locations?.name ?? ""}${s.courts?.name ? ` · ${s.courts.name}` : ""} · ${FORMAT_LABEL[s.format]} (${s.capacity} vaga${s.capacity > 1 ? "s" : ""}) · deslocamento ${s.travel_buffer_minutes} min`} />
      {latest && latest.id !== s.id ? (
        <p className="mb-4 text-sm">Esta é uma versão anterior. <Link className="font-semibold text-link" href={`/professor/agenda/horarios/${latest.id}`}>Ver versão mais recente</Link></p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Alunos com vaga fixa" />
          {(enrollments.data ?? []).length === 0 ? <EmptyState title="Nenhum aluno matriculado" /> : (
            <ul className="divide-y divide-border text-sm">
              {((enrollments.data ?? []) as unknown as E[]).map((e) => (
                <li key={e.id} className="flex min-h-11 items-center justify-between gap-2 py-2">
                  <Link href={`/professor/alunos/${e.students.id}?aba=aulas`} className="font-semibold text-link">{e.students.full_name}</Link>
                  <span className="text-muted">desde {formatDate(e.valid_from)}{e.valid_until ? ` até ${formatDate(e.valid_until)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Próximas aulas" />
          {(occurrences.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhuma aula futura gerada.</p> : (
            <ul className="divide-y divide-border text-sm">
              {(occurrences.data ?? []).map((o) => (
                <li key={o.id}>
                  <Link href={`/professor/aulas/${o.id}`} className="flex min-h-11 items-center gap-2 py-2">
                    <span className="flex-1 font-semibold">{formatShortDate(o.local_date)} · {formatTime(o.start_time)}</span>
                    {o.status !== "scheduled" ? <StatusBadge tone={OCCURRENCE_STATUS[o.status].tone}>{OCCURRENCE_STATUS[o.status].label}</StatusBadge> : null}
                    {o.is_exception && o.status === "scheduled" ? <StatusBadge tone="info">Remarcada</StatusBadge> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {editable ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Alterar a partir de uma data" description="Cria uma nova versão; o histórico anterior fica preservado." />
            <SeriesEditForm seriesId={s.id} today={today} defaultBuffer={orgRow.data?.default_travel_buffer_minutes ?? 30}
              locations={(locations.data ?? []).map((l) => ({ id: l.id, name: l.name, courts: (l.courts ?? []).filter((c) => c.active) }))}
              defaults={{ weekday: s.weekday, start_time: s.start_time, duration_minutes: s.duration_minutes, format: s.format, capacity: s.capacity,
                location_id: s.location_id, court_id: s.court_id, travel_buffer_minutes: s.travel_buffer_minutes, level: s.level, title: s.title }} />
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Histórico de versões" />
          <ol className="space-y-1 text-sm">
            {(versions.data ?? []).map((v) => (
              <li key={v.id} className={v.id === s.id ? "font-semibold" : "text-muted"}>
                {formatDate(v.valid_from)} – {v.valid_until ? formatDate(v.valid_until) : "atual"}: {weekdayLabel(v.weekday, true)} {formatTime(v.start_time)}, {v.duration_minutes} min, {FORMAT_LABEL[v.format]} ({v.capacity})
              </li>
            ))}
          </ol>
        </Card>
        {editable && latest?.id === s.id ? (
          <Card>
            <Disclosure summary="Encerrar este horário">
              <ActionForm action={endSeriesAction.bind(null, s.id)} submitLabel="Encerrar horário" submitVariant="danger"
                confirm="As vagas serão encerradas e as aulas futuras removidas ou canceladas. Continuar?">
                <TextField name="last_date" type="date" label="Última aula" defaultValue={today} min={s.valid_from} required />
                <TextField name="reason" label="Motivo" required />
              </ActionForm>
            </Disclosure>
          </Card>
        ) : null}
      </div>
    </>
  );
}
