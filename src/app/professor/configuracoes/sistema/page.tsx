import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";

export const metadata: Metadata = { title: "Sistema" };

type Health = { jobs: { job: string; status: string; started_at: string; finished_at: string | null }[]; last_failure: string | null;
  outbox_pending: number; outbox_failed: number; files_pending_scan: number; uploads_stuck: number };

const JOB_LABEL: Record<string, string> = {
  daily: "Rotina de hora em hora (aulas, cobranças, avisos de vencimento, restrições)",
  frequent: "Rotina por minuto (lembretes de aula e envio de avisos)",
};

export default async function SystemPage() {
  const { supabase, org } = await requireCoach();
  const { data } = await supabase.rpc("job_health");
  const h = data as Health | null;
  const scanner = env().FILE_SCAN_PROVIDER === "clamav" && env().CLAMAV_HOST;
  return (
    <>
      <PageHeader back={{ href: "/professor/configuracoes", label: "Configurações" }} title="Sistema" description="Saúde das rotinas automáticas e integrações." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Rotinas automáticas" description="Executadas no banco (pg_cron), sem depender de alguém abrir o app." />
          {!h || h.jobs.length === 0 ? <Alert tone="warning">Nenhuma execução registrada ainda.</Alert> : (
            <ul className="space-y-2 text-sm">
              {h.jobs.map((j) => (
                <li key={j.job} className="rounded-xl border border-border p-3">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{JOB_LABEL[j.job] ?? j.job}
                    <StatusBadge tone={j.status === "succeeded" ? "success" : j.status === "running" ? "info" : "danger"}>
                      {j.status === "succeeded" ? "OK" : j.status === "running" ? "Executando" : "Falhou"}</StatusBadge></p>
                  <p className="text-muted">Última execução: {formatDateTime(j.finished_at ?? j.started_at, org.timezone)}</p>
                </li>
              ))}
            </ul>
          )}
          {h?.last_failure ? <Alert tone="warning" className="mt-3">Houve falha em {formatDateTime(h.last_failure, org.timezone)}. A rotina tenta novamente na próxima execução.</Alert> : null}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">Avisos na fila</dt><dd className="font-semibold">{h?.outbox_pending ?? 0}</dd></div>
            <div><dt className="text-muted">Avisos com falha</dt><dd className="font-semibold">{h?.outbox_failed ?? 0}</dd></div>
            <div><dt className="text-muted">Arquivos em quarentena</dt><dd className="font-semibold">{h?.files_pending_scan ?? 0}</dd></div>
            <div><dt className="text-muted">Envios interrompidos</dt><dd className="font-semibold">{h?.uploads_stuck ?? 0}</dd></div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Integrações" />
          <ul className="space-y-3 text-sm">
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>Verificação antimalware de comprovantes</span>
              <StatusBadge tone={scanner ? "success" : "warning"}>{scanner ? "ClamAV configurado" : "Não configurada"}</StatusBadge>
            </li>
            {!scanner ? <li><Alert tone="warning">Sem antimalware, comprovantes ficam em quarentena e não podem ser abertos. Confira os créditos direto no banco.</Alert></li> : null}
            <li className="flex flex-wrap items-center justify-between gap-2"><span>Envio de convites por e-mail</span><StatusBadge tone="neutral">Não disponível — envio manual do link</StatusBadge></li>
            <li className="flex flex-wrap items-center justify-between gap-2"><span>WhatsApp</span><StatusBadge tone="neutral">Não integrado nesta versão</StatusBadge></li>
            <li className="flex flex-wrap items-center justify-between gap-2"><span>Pagamentos</span><StatusBadge tone="neutral">Pix manual (sem conciliação automática)</StatusBadge></li>
          </ul>
        </Card>
      </div>
    </>
  );
}
