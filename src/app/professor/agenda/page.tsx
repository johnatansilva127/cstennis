import type { Metadata } from "next";
import { requestNow } from "@/lib/clock";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import {
  addDays, addMonths, endOfMonth, formatDateLong, formatShortDate, formatTime, isValidDate, isoWeekday, monthLabel, startOfMonth,
  startOfWeek, todayInTz, weekdayLabel,
} from "@/lib/dates";
import { FORMAT_LABEL, OCCURRENCE_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionForm, SelectField, TextField } from "@/components/ui/form";
import { cn } from "@/components/ui/cn";
import { unavailabilityAction } from "./actions";

export const metadata: Metadata = { title: "Agenda" };

type Occ = { occurrence_id: string; title: string | null; local_date: string; start_time: string; duration_minutes: number; starts_at: string;
  status: string; is_exception: boolean; format: string; capacity: number; enrolled: number; marked: number; location_name: string; court_name: string | null };

export default async function AgendaPage({ searchParams }: PageProps<"/professor/agenda">) {
  const sp = await searchParams;
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const view = sp.visao === "mes" ? "mes" : "semana";
  const pendentes = sp.pendentes === "1";
  const base = typeof sp.data === "string" && isValidDate(sp.data) ? sp.data : today;
  const from = pendentes ? addDays(today, -14) : view === "mes" ? startOfWeek(startOfMonth(base)) : startOfWeek(base);
  const to = pendentes ? today : view === "mes" ? addDays(startOfWeek(endOfMonth(base)), 6) : addDays(from, 6);
  const [{ data }, locations] = await Promise.all([
    supabase.rpc("coach_agenda", { p_from: from, p_to: to }),
    supabase.from("locations").select("id, name").eq("active", true).order("name"),
  ]);
  let occ = (data ?? []) as Occ[];
  const now = requestNow();
  if (pendentes) occ = occ.filter((o) => o.status === "scheduled" && new Date(o.starts_at).getTime() < now);
  const days = Array.from({ length: Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1 }, (_, i) => addDays(from, i));
  const byDay = new Map<string, Occ[]>();
  for (const o of occ) byDay.set(o.local_date, [...(byDay.get(o.local_date) ?? []), o]);

  const prev = view === "mes" ? addMonths(base, -1) : addDays(from, -7);
  const next = view === "mes" ? addMonths(base, 1) : addDays(from, 7);
  const q = (d: string) => `/professor/agenda?visao=${view}&data=${d}`;

  return (
    <>
      <PageHeader title={pendentes ? "Chamadas pendentes" : "Agenda"}
        description={pendentes ? "Aulas dos últimos 14 dias ainda sem chamada registrada." : undefined}
        actions={<>
          <ButtonLink href="/professor/agenda/horarios" variant="secondary"><Repeat aria-hidden className="size-4" /> Horários fixos</ButtonLink>
          <ButtonLink href="/professor/agenda/horarios/novo"><Plus aria-hidden className="size-4" /> Novo horário</ButtonLink>
        </>} />

      {!pendentes ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link href={q(prev)} className={buttonClasses("ghost", "sm")} aria-label={view === "mes" ? "Mês anterior" : "Semana anterior"}><ChevronLeft aria-hidden className="size-5" /></Link>
            <p className="min-w-40 text-center font-display font-bold capitalize">
              {view === "mes" ? monthLabel(base) : `${formatShortDate(from)} – ${formatShortDate(to)}`}
            </p>
            <Link href={q(next)} className={buttonClasses("ghost", "sm")} aria-label={view === "mes" ? "Próximo mês" : "Próxima semana"}><ChevronRight aria-hidden className="size-5" /></Link>
            <Link href={`/professor/agenda?visao=${view}`} className={buttonClasses("ghost", "sm")}>Hoje</Link>
          </div>
          <nav aria-label="Visualização" className="flex rounded-xl bg-surface-2 p-1">
            {(["semana", "mes"] as const).map((v) => (
              <Link key={v} href={`/professor/agenda?visao=${v}&data=${base}`} aria-current={view === v ? "page" : undefined}
                className={cn("inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold", view === v ? "bg-surface shadow-sm" : "text-muted")}>
                {v === "semana" ? "Semana" : "Mês"}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}

      {view === "mes" && !pendentes ? (
        <div role="grid" aria-label={`Calendário de ${monthLabel(base)}`} className="grid grid-cols-7 gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => <div key={d} role="columnheader" className="py-1 text-center text-xs font-semibold uppercase text-muted">{weekdayLabel(d, true)}</div>)}
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const active = items.filter((o) => o.status !== "cancelled").length;
            const inMonth = d.slice(0, 7) === base.slice(0, 7);
            return (
              <Link key={d} role="gridcell" href={`/professor/agenda?visao=semana&data=${d}`}
                aria-label={`${formatDateLong(d)}: ${active} aula(s)`}
                className={cn("flex min-h-16 flex-col rounded-xl border p-1.5 text-sm", inMonth ? "border-border bg-surface" : "border-transparent bg-surface-2 text-muted",
                  d === today && "ring-2 ring-primary")}>
                <span className="font-semibold">{Number(d.slice(8))}</span>
                {active ? <span className="mt-auto rounded-md bg-info-bg px-1 text-xs font-semibold text-info">{active} aula{active > 1 ? "s" : ""}</span> : null}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={cn("grid gap-3", !pendentes && "xl:grid-cols-7")}>
          {(pendentes ? [...byDay.keys()].sort() : days).map((d) => {
            const items = byDay.get(d) ?? [];
            if (pendentes && items.length === 0) return null;
            return (
              <section key={d} aria-labelledby={`dia-${d}`} className={cn("rounded-2xl border border-border bg-surface p-3", d === today && "ring-2 ring-primary")}>
                <h2 id={`dia-${d}`} className="mb-2 text-sm font-bold capitalize">
                  {weekdayLabel(isoWeekday(d), true)} {d.slice(8)}/{d.slice(5, 7)}{d === today ? <span className="ml-1 text-link">· hoje</span> : null}
                </h2>
                {items.length === 0 ? <p className="text-xs text-muted">Sem aulas</p> : (
                  <ul className="space-y-2">
                    {items.map((o) => (
                      <li key={o.occurrence_id}>
                        <Link href={`/professor/aulas/${o.occurrence_id}`}
                          className={cn("block rounded-xl border px-2.5 py-2 text-sm hover:border-primary", o.status === "cancelled" ? "border-danger/30 bg-danger-bg" : "border-border bg-surface-2")}>
                          <span className="block font-bold">{formatTime(o.start_time)}</span>
                          <span className="block truncate">{o.title ?? FORMAT_LABEL[o.format]} · {o.enrolled}/{o.capacity}</span>
                          <span className="block truncate text-xs text-muted">{o.location_name}{o.court_name ? ` · ${o.court_name}` : ""}</span>
                          {o.status !== "scheduled" || o.is_exception ? (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {o.status !== "scheduled" ? <StatusBadge tone={OCCURRENCE_STATUS[o.status].tone}>{OCCURRENCE_STATUS[o.status].label}</StatusBadge> : null}
                              {o.is_exception && o.status === "scheduled" ? <StatusBadge tone="info">Remarcada</StatusBadge> : null}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {pendentes && occ.length === 0 ? <EmptyState title="Nenhuma chamada pendente" /> : null}
        </div>
      )}

      <Card className="mt-6">
        <Disclosure summary="Registrar feriado ou indisponibilidade">
          <ActionForm action={unavailabilityAction} submitLabel="Registrar e cancelar aulas afetadas" resetOnSuccess
            confirm="As aulas futuras no período serão canceladas e os alunos avisados. Continuar?">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="starts_on" type="date" label="De" required min={today} />
              <TextField name="ends_on" type="date" label="Até (opcional)" min={today} />
            </div>
            <SelectField name="location_id" label="Local" placeholder="Todos os locais" options={(locations.data ?? []).map((l) => ({ value: l.id, label: l.name }))} />
            <TextField name="reason" label="Motivo (visível aos alunos)" required placeholder="Ex.: Feriado de Finados" />
          </ActionForm>
        </Disclosure>
      </Card>
    </>
  );
}
