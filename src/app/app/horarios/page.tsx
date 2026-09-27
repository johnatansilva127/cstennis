import type { Metadata } from "next";
import { participantContext } from "@/lib/participant";
import { endTime, formatDate, formatTime, weekdayLabel } from "@/lib/dates";
import { FORMAT_LABEL, REQUEST_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionForm, TextAreaField, TextField } from "@/components/ui/form";
import { RestrictedNotice } from "@/components/restricted";
import { cancelRequestAction, requestSlotAction } from "./actions";

export const metadata: Metadata = { title: "Horários e pedidos" };

export default async function SlotsPage() {
  const { supabase, student, restricted, who } = await participantContext();
  if (restricted) return <><PageHeader title="Horários e pedidos" /><RestrictedNotice who={who} /></>;
  const [slots, requests] = await Promise.all([
    supabase.rpc("list_available_slots", { p_student_id: student.id }),
    supabase.from("enrollment_requests").select("id, status, desired_start, decision_reason, created_at, series_id").eq("student_id", student.id)
      .order("created_at", { ascending: false }).limit(20),
  ]);
  const blocked = student.restriction === "block_requests";
  const available = (slots.data ?? []).filter((s) => !s.already_enrolled && (s.free_spots > 0 || s.pending_request));
  return (
    <>
      <PageHeader title="Horários com vagas" description="Peça uma vaga fixa. O professor confirma; pedidos não reservam vaga automaticamente." />
      {blocked ? <Alert tone="danger" className="mb-4" title="Novos pedidos bloqueados">Há pendência financeira. Regularize em Mensalidades para voltar a pedir vagas.</Alert> : null}
      {available.length === 0 ? <EmptyState title="Nenhum horário com vaga no momento" description="Fale com o professor se precisar de outro horário." /> : (
        <ul className="space-y-3">
          {available.map((s) => (
            <li key={s.series_id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-bold">{weekdayLabel(s.weekday)} · {formatTime(s.start_time)}–{endTime(s.start_time, s.duration_minutes)}</p>
                    <p className="text-sm text-muted">{s.title ?? FORMAT_LABEL[s.format]}{s.level ? ` · ${s.level}` : ""} · {s.location_name}{s.court_name ? ` · ${s.court_name}` : ""}</p>
                    {s.location_address ? <p className="text-xs text-muted">{s.location_address}</p> : null}
                  </div>
                  <StatusBadge tone={s.free_spots > 0 ? "success" : "neutral"}>{s.free_spots} vaga{s.free_spots === 1 ? "" : "s"}</StatusBadge>
                </div>
                {s.pending_request ? <p className="mt-3 text-sm font-semibold text-warning">Pedido enviado — aguardando o professor.</p> : blocked ? null : (
                  <div className="mt-3">
                    <Disclosure summary="Pedir esta vaga">
                      <ActionForm action={requestSlotAction.bind(null, student.id, s.series_id)} submitLabel="Enviar pedido" pendingLabel="Enviando…">
                        <TextField name="desired_start" type="date" label="A partir de" defaultValue={s.next_date} min={s.next_date} />
                        <TextAreaField name="message" label="Mensagem ao professor (opcional)" rows={2} maxLength={500} />
                      </ActionForm>
                    </Disclosure>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-bold">Meus pedidos</h2>
        {(requests.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum pedido ainda.</p> : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {(requests.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="flex-1">Início desejado {formatDate(r.desired_start)}{r.decision_reason ? ` · ${r.decision_reason}` : ""}</span>
                <StatusBadge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</StatusBadge>
                {r.status === "pending" ? (
                  <ActionForm action={cancelRequestAction.bind(null, r.id)} submitLabel="Cancelar" submitVariant="secondary" submitFull={false}>
                    <span className="sr-only">Cancelar pedido</span>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
