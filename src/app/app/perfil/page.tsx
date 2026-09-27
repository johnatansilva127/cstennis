import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { participantContext } from "@/lib/participant";
import { formatDateTime } from "@/lib/dates";
import { PRIVACY_KIND } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { ActionForm, SelectField, TextAreaField } from "@/components/ui/form";
import { buttonClasses } from "@/components/ui/button";
import { ProfileForms } from "@/components/profile-forms";
import { privacyRequestAction } from "./actions";

export const metadata: Metadata = { title: "Perfil" };

export default async function ParticipantProfile() {
  const { supabase, ctx, student, tz } = await participantContext();
  const { data: requests } = await supabase.from("privacy_requests").select("id, kind, status, resolution, created_at").order("created_at", { ascending: false }).limit(10);
  return (
    <>
      <PageHeader title="Perfil" description={ctx.email} />
      <ProfileForms fullName={ctx.full_name} theme={ctx.theme} />
      <Card className="mt-5">
        <CardHeader title="Seus dados e privacidade" description={<>Leia o <Link href="/privacidade" className="font-semibold text-link">aviso de privacidade</Link>.</>} />
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm text-muted">Baixe uma cópia dos dados de {student.relation === "student" ? "você" : student.full_name} disponíveis no app.</p>
            <a href={`/api/exportar/${student.id}`} className={buttonClasses("secondary")}><Download aria-hidden className="size-4" /> Baixar meus dados (JSON)</a>
          </div>
          <ActionForm action={privacyRequestAction.bind(null, student.id)} submitLabel="Enviar solicitação" resetOnSuccess>
            <SelectField name="kind" label="Solicitação" required placeholder="Selecione"
              options={Object.entries(PRIVACY_KIND).map(([value, label]) => ({ value, label }))} />
            <TextAreaField name="details" label="Detalhes (opcional)" rows={3} maxLength={2000} />
          </ActionForm>
        </div>
        {(requests ?? []).length ? (
          <ul className="mt-4 divide-y divide-border text-sm">
            {(requests ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1">{PRIVACY_KIND[r.kind]} · {formatDateTime(r.created_at, tz)}{r.resolution ? ` · ${r.resolution}` : ""}</span>
                <StatusBadge tone={r.status === "completed" ? "success" : r.status === "rejected" ? "neutral" : "warning"}>
                  {r.status === "open" ? "Aberta" : r.status === "in_progress" ? "Em andamento" : r.status === "completed" ? "Concluída" : "Recusada"}</StatusBadge>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
      <form action="/auth/sair" method="post" className="mt-6">
        <button type="submit" className={buttonClasses("danger", "lg", true)}>Sair</button>
      </form>
    </>
  );
}
