import type { Metadata } from "next";
import { requestNow } from "@/lib/clock";
import Link from "next/link";
import { CalendarClock, ChevronRight, ClipboardList, FileCheck2, MapPin, Receipt, UserPlus, Users } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import { formatDateLong, formatTime, endTime, todayInTz, addDays } from "@/lib/dates";
import { FORMAT_LABEL, OCCURRENCE_STATUS } from "@/lib/labels";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge, Alert } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Início" };

type AgendaRow = {
  occurrence_id: string; title: string | null; local_date: string; start_time: string; duration_minutes: number;
  starts_at: string; status: string; format: string; capacity: number; enrolled: number; marked: number;
  location_name: string; court_name: string | null; cancel_reason: string | null;
};

export default async function CoachHome() {
  const { supabase, ctx, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const [agendaRes, pendingReq, proofs, overdue, pendingAttendance, invites, privacy, health] = await Promise.all([
    supabase.rpc("coach_agenda", { p_from: today, p_to: addDays(today, 6) }),
    supabase.from("enrollment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("payment_submissions").select("id", { count: "exact", head: true }).in("status", ["received", "under_review"]),
    supabase.from("invoices").select("id", { count: "exact", head: true }).in("status", ["open", "under_review"]).lt("due_date", today),
    supabase.from("lesson_occurrences").select("id", { count: "exact", head: true })
      .eq("status", "scheduled").lt("starts_at", new Date().toISOString()).gte("local_date", addDays(today, -14)),
    supabase.from("invitations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("privacy_requests").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    supabase.rpc("job_health"),
  ]);
  const agenda = (agendaRes.data ?? []) as AgendaRow[];
  const todays = agenda.filter((o) => o.local_date === today);
  const now = requestNow();
  const next = agenda.find((o) => o.status === "scheduled" && new Date(o.starts_at).getTime() + o.duration_minutes * 60000 > now);
  const jobsFailed = (health.data as { last_failure: string | null } | null)?.last_failure;

  const pendencies = [
    { href: "/professor/pedidos", label: "Pedidos de vaga", count: pendingReq.count ?? 0, icon: <ClipboardList aria-hidden className="size-5" /> },
    { href: "/professor/financeiro/comprovantes", label: "Comprovantes para conferir", count: proofs.count ?? 0, icon: <FileCheck2 aria-hidden className="size-5" /> },
    { href: "/professor/financeiro?status=overdue", label: "Mensalidades em atraso", count: overdue.count ?? 0, icon: <Receipt aria-hidden className="size-5" /> },
    { href: "/professor/agenda?pendentes=1", label: "Chamadas não registradas", count: pendingAttendance.count ?? 0, icon: <CalendarClock aria-hidden className="size-5" /> },
    { href: "/professor/convites", label: "Convites aguardando aceite", count: invites.count ?? 0, icon: <UserPlus aria-hidden className="size-5" /> },
    { href: "/professor/configuracoes/privacidade", label: "Solicitações de privacidade", count: privacy.count ?? 0, icon: <Users aria-hidden className="size-5" /> },
  ].filter((p) => p.count > 0);

  return (
    <>
      <PageHeader eyebrow={formatDateLong(today)} title={`Olá, ${(ctx.full_name || "professor").split(" ")[0]}`}
        actions={<ButtonLink href="/professor/alunos/novo" variant="primary"><UserPlus aria-hidden className="size-4" /> Novo aluno</ButtonLink>} />

      {jobsFailed ? (
        <Alert tone="warning" className="mb-4" title="Rotinas automáticas com falha recente">
          Verifique em <Link href="/professor/configuracoes/sistema">Configurações › Sistema</Link>.
        </Alert>
      ) : null}

      {next ? (
        <section aria-labelledby="proxima" className="brand-gradient mb-5 rounded-3xl p-5 shadow-card">
          <p id="proxima" className="label-caps text-accent">Próxima aula</p>
          <p className="mt-2 font-display text-3xl font-black">
            {formatTime(next.start_time)}<span className="text-lg font-bold text-white/80"> – {endTime(next.start_time, next.duration_minutes)}</span>
          </p>
          <p className="mt-1 text-sm text-white/90">
            {next.local_date === today ? "Hoje" : formatDateLong(next.local_date)} · {next.title ?? FORMAT_LABEL[next.format]} · {next.enrolled}/{next.capacity} alunos
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-white/90">
            <MapPin aria-hidden className="size-4" /> {next.location_name}{next.court_name ? ` · ${next.court_name}` : ""}
          </p>
          <div className="mt-4">
            <ButtonLink href={`/professor/aulas/${next.occurrence_id}`} variant="accent">Abrir aula e chamada</ButtonLink>
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Aulas de hoje" action={<Link href="/professor/agenda" className="inline-flex min-h-11 items-center text-sm font-semibold text-link">Ver agenda</Link>} />
          {todays.length === 0 ? (
            <EmptyState title="Nenhuma aula hoje" description="Aproveite para revisar pendências ou cadastrar horários." />
          ) : (
            <ul className="divide-y divide-border">
              {todays.map((o) => (
                <li key={o.occurrence_id}>
                  <Link href={`/professor/aulas/${o.occurrence_id}`} className="flex min-h-14 items-center gap-3 py-3">
                    <span className="w-14 shrink-0 font-display text-lg font-bold">{formatTime(o.start_time)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{o.title ?? FORMAT_LABEL[o.format]} · {o.enrolled}/{o.capacity}</span>
                      <span className="block truncate text-sm text-muted">{o.location_name}{o.court_name ? ` · ${o.court_name}` : ""}</span>
                    </span>
                    <StatusBadge tone={OCCURRENCE_STATUS[o.status].tone}>{OCCURRENCE_STATUS[o.status].label}</StatusBadge>
                    <ChevronRight aria-hidden className="size-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Pendências" />
          {pendencies.length === 0 ? (
            <EmptyState title="Tudo em dia" description="Não há pedidos, comprovantes ou chamadas pendentes." />
          ) : (
            <ul className="space-y-2">
              {pendencies.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} className="flex min-h-12 items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 hover:bg-info-bg">
                    <span className="text-link">{p.icon}</span>
                    <span className="flex-1 text-sm font-semibold">{p.label}</span>
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-sm font-bold text-on-accent">{p.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
