import type { Metadata } from "next";
import { requestNow } from "@/lib/clock";
import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardList, MapPin, Wallet } from "lucide-react";
import { participantContext } from "@/lib/participant";
import { addDays, endTime, formatDate, formatDateLong, formatTime, todayInTz } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { FORMAT_LABEL, RESTRICTION_LEVEL } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { RestrictedNotice } from "@/components/restricted";

export const metadata: Metadata = { title: "Início" };

export default async function ParticipantHome() {
  const { supabase, ctx, student, tz, restricted, who } = await participantContext();
  const today = todayInTz(tz);
  const [lessons, invoices, requests, notes, restriction, orgInfo] = await Promise.all([
    restricted ? Promise.resolve({ data: [] }) : supabase.rpc("student_lessons", { p_student_id: student.id, p_from: today, p_to: addDays(today, 30) }),
    supabase.from("invoices").select("id, competence, amount_cents, due_date, status").eq("student_id", student.id).in("status", ["open", "under_review"]).order("due_date"),
    restricted ? Promise.resolve({ count: 0 }) : supabase.from("enrollment_requests").select("id", { count: "exact", head: true }).eq("student_id", student.id).eq("status", "pending"),
    supabase.from("notifications").select("id, title, body, link_path, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(3),
    supabase.rpc("student_restriction", { p_student_id: student.id }),
    supabase.rpc("organization_public_info"),
  ]);
  const now = requestNow();
  type L = { occurrence_id: string; title: string | null; local_date: string; start_time: string; duration_minutes: number; starts_at: string; status: string;
    format: string; location_name: string; location_address: string | null; location_instructions: string | null; court_name: string | null };
  const next = ((lessons.data ?? []) as L[]).find((l) => l.status === "scheduled" && new Date(l.starts_at).getTime() + l.duration_minutes * 60000 > now);
  const level = (restriction.data as { level: string; effective_from: string | null } | null);
  const overdue = (invoices.data ?? []).filter((i) => i.due_date < today);
  const firstName = (ctx.full_name || "").split(" ")[0];
  const contact = (orgInfo.data as { contact_info: string | null }[] | null)?.[0]?.contact_info;

  return (
    <>
      <PageHeader eyebrow={formatDateLong(today)} title={`Olá${firstName ? `, ${firstName}` : ""}`}
        description={student.relation === "guardian" ? `Acompanhando ${student.full_name}` : undefined} />

      {level && level.level !== "none" ? (
        <Alert tone={RESTRICTION_LEVEL[level.level].tone} title={RESTRICTION_LEVEL[level.level].label} className="mb-4">
          {RESTRICTION_LEVEL[level.level].description} <Link href="/app/financeiro">Ver mensalidades</Link>
        </Alert>
      ) : null}

      {restricted ? <RestrictedNotice who={who} /> : next ? (
        <section aria-labelledby="proxima" className="brand-gradient mb-5 rounded-3xl p-5 shadow-card">
          <p id="proxima" className="label-caps text-accent">Próxima aula{who !== "você" ? ` de ${who}` : ""}</p>
          <p className="mt-2 font-display text-4xl font-black">{formatTime(next.start_time)}
            <span className="text-lg font-bold text-white/80"> – {endTime(next.start_time, next.duration_minutes)}</span></p>
          <p className="mt-1 font-semibold">{next.local_date === today ? "Hoje" : formatDateLong(next.local_date)} · {next.title ?? FORMAT_LABEL[next.format]}</p>
          <p className="mt-2 flex items-start gap-1 text-sm text-white/90"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{next.location_name}{next.court_name ? ` · ${next.court_name}` : ""}{next.location_address ? ` — ${next.location_address}` : ""}</span></p>
          <div className="mt-4"><ButtonLink href={`/app/aulas/${next.occurrence_id}`} variant="accent">Ver detalhes</ButtonLink></div>
        </section>
      ) : (
        <div className="mb-5"><EmptyState icon={<CalendarDays aria-hidden className="size-8" />} title="Nenhuma aula nos próximos 30 dias"
          description="Veja os horários com vagas e peça uma vaga fixa." action={<ButtonLink href="/app/horarios">Ver horários</ButtonLink>} /></div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title="Mensalidades" action={<Wallet aria-hidden className="size-5 text-link" />} />
          {(invoices.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhuma mensalidade em aberto.</p> : (
            <ul className="space-y-2 text-sm">
              {(invoices.data ?? []).slice(0, 3).map((i) => (
                <li key={i.id}>
                  <Link href={`/app/financeiro/${i.id}`} className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-surface-2 px-3">
                    <span>{formatBRL(i.amount_cents)} · vence {formatDate(i.due_date)}</span>
                    <span className={i.due_date < today ? "font-semibold text-danger" : i.status === "under_review" ? "text-warning" : "text-muted"}>
                      {i.due_date < today ? "Em atraso" : i.status === "under_review" ? "Em análise" : "Em aberto"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {overdue.length ? <p className="mt-2 text-xs text-danger">{overdue.length} em atraso</p> : null}
        </Card>
        <Card>
          <CardHeader title="Avisos recentes" action={<Link href="/app/avisos" className="inline-flex min-h-11 items-center text-sm font-semibold text-link">Todos</Link>} />
          {(notes.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum aviso novo.</p> : (
            <ul className="space-y-2">
              {(notes.data ?? []).map((n) => (
                <li key={n.id}>
                  <Link href={n.link_path ?? "/app/avisos"} className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    <span className="flex-1"><span className="block font-semibold">{n.title}</span><span className="block text-muted">{n.body}</span></span>
                    <ChevronRight aria-hidden className="size-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {!restricted && (requests.count ?? 0) > 0 ? (
          <Card>
            <CardHeader title="Pedidos de vaga" action={<ClipboardList aria-hidden className="size-5 text-link" />} />
            <p className="text-sm">{requests.count} pedido(s) aguardando o professor. <Link href="/app/horarios" className="font-semibold text-link">Acompanhar</Link></p>
          </Card>
        ) : null}
        {contact ? (
          <Card>
            <CardHeader title="Contato com o professor" />
            <p className="whitespace-pre-line text-sm text-muted">{contact}</p>
          </Card>
        ) : null}
      </div>
    </>
  );
}
