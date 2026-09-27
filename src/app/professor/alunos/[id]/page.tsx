import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { STUDENT_STATUS, RESTRICTION_LEVEL } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { TabLinks } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status";
import { TabResumo } from "./tab-resumo";
import { TabAulas } from "./tab-aulas";
import { TabFinanceiro } from "./tab-financeiro";
import { TabPresenca } from "./tab-presenca";
import { TabEvolucao } from "./tab-evolucao";
import { TabJogos } from "./tab-jogos";
import { TabHistorico } from "./tab-historico";

export const metadata: Metadata = { title: "Aluno" };

const TABS = [
  { key: "resumo", label: "Resumo e acesso" },
  { key: "aulas", label: "Aulas" },
  { key: "financeiro", label: "Financeiro" },
  { key: "presenca", label: "Presença" },
  { key: "evolucao", label: "Evolução" },
  { key: "jogos", label: "Jogos" },
  { key: "historico", label: "Histórico" },
];

export default async function StudentPage({ params, searchParams }: PageProps<"/professor/alunos/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.aba) ? String(sp.aba) : "resumo";
  const { supabase, org } = await requireCoach();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: student } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (!student) notFound();
  const { data: restriction } = await supabase.rpc("student_restriction", { p_student_id: id });
  const r = restriction as { level: string } | null;
  const today = todayInTz(org.timezone);
  const props = { studentId: id, student, supabase, today, tz: org.timezone };

  return (
    <>
      <PageHeader
        back={{ href: "/professor/alunos", label: "Alunos" }}
        eyebrow={student.kind === "child" ? "Aluno criança" : "Aluno adulto"}
        title={student.full_name}
        description={
          <span className="mt-1 flex flex-wrap gap-1.5">
            <StatusBadge tone={STUDENT_STATUS[student.status].tone}>{STUDENT_STATUS[student.status].label}</StatusBadge>
            {r && r.level !== "none" ? <StatusBadge tone={RESTRICTION_LEVEL[r.level].tone}>{RESTRICTION_LEVEL[r.level].label}</StatusBadge> : null}
          </span>
        }
      />
      <TabLinks label="Seções do aluno" current={tab} tabs={TABS.map((t) => ({ ...t, href: `/professor/alunos/${id}?aba=${t.key}` }))} />
      {tab === "resumo" ? <TabResumo {...props} /> : null}
      {tab === "aulas" ? <TabAulas {...props} /> : null}
      {tab === "financeiro" ? <TabFinanceiro {...props} /> : null}
      {tab === "presenca" ? <TabPresenca {...props} /> : null}
      {tab === "evolucao" ? <TabEvolucao {...props} /> : null}
      {tab === "jogos" ? <TabJogos {...props} /> : null}
      {tab === "historico" ? <TabHistorico {...props} /> : null}
    </>
  );
}
