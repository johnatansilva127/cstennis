import type { Metadata } from "next";
import { participantContext } from "@/lib/participant";
import { todayInTz } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { RestrictedNotice } from "@/components/restricted";
import { MatchForm } from "../match-form";
import { saveMatchAction } from "../actions";

export const metadata: Metadata = { title: "Registrar jogo" };

export default async function NewMatchPage() {
  const { student, tz, restricted, who } = await participantContext();
  if (restricted) return <><PageHeader title="Registrar jogo" /><RestrictedNotice who={who} /></>;
  return (
    <>
      <PageHeader back={{ href: "/app/jogos", label: "Jogos" }} title="Registrar jogo"
        description={who !== "você" ? `Em nome de ${student.full_name} (seu nome fica registrado como autor).` : undefined} />
      <MatchForm action={saveMatchAction.bind(null, student.id, null)} today={todayInTz(tz)} />
    </>
  );
}
