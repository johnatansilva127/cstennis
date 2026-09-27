import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { participantContext } from "@/lib/participant";
import { addDays, endTime, formatDateLong, formatTime, todayInTz } from "@/lib/dates";
import { ATTENDANCE_STATUS, FORMAT_LABEL, OCCURRENCE_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { AccessDenied } from "@/components/ui/states";
import { RestrictedNotice } from "@/components/restricted";

export const metadata: Metadata = { title: "Aula" };

export default async function LessonPage({ params }: PageProps<"/app/aulas/[id]">) {
  const { id } = await params;
  const { supabase, student, tz, restricted, who } = await participantContext();
  if (restricted) return <><PageHeader title="Aula" back={{ href: "/app/aulas", label: "Aulas" }} /><RestrictedNotice who={who} /></>;
  const today = todayInTz(tz);
  // O RPC só retorna aulas do aluno em contexto: ID de outra aula simplesmente não aparece.
  const { data } = await supabase.rpc("student_lessons", { p_student_id: student.id, p_from: addDays(today, -365), p_to: addDays(today, 30) });
  const l = (data ?? []).find((x) => x.occurrence_id === id);
  if (!l) return <><PageHeader title="Aula" back={{ href: "/app/aulas", label: "Aulas" }} /><AccessDenied backHref="/app/aulas" /></>;
  return (
    <>
      <PageHeader back={{ href: "/app/aulas", label: "Aulas" }} eyebrow={formatDateLong(l.local_date)}
        title={`${formatTime(l.start_time)}–${endTime(l.start_time, l.duration_minutes)}`} description={l.title ?? FORMAT_LABEL[l.format]} />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge tone={OCCURRENCE_STATUS[l.status].tone}>{OCCURRENCE_STATUS[l.status].label}</StatusBadge>
        {l.status === "completed" ? <StatusBadge tone={ATTENDANCE_STATUS[l.attendance ?? "none"].tone}>{ATTENDANCE_STATUS[l.attendance ?? "none"].label}</StatusBadge> : null}
      </div>
      {l.status === "cancelled" ? <Alert tone="danger" title="Aula cancelada" className="mb-4">{l.cancel_reason} Aulas canceladas não contam como falta.</Alert> : null}
      {l.exception_note ? <Alert tone="info" className="mb-4">{l.exception_note}</Alert> : null}
      <Card>
        <p className="flex items-start gap-2 font-semibold"><MapPin aria-hidden className="mt-0.5 size-5 text-link" />
          <span>{l.location_name}{l.court_name ? ` · ${l.court_name}` : ""}{l.location_address ? <span className="block font-normal text-muted">{l.location_address}</span> : null}</span></p>
        {l.location_instructions ? <p className="mt-3 whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm">{l.location_instructions}</p> : null}
      </Card>
    </>
  );
}
