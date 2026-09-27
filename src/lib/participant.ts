import "server-only";
import { currentStudent, requireParticipant } from "@/lib/auth";

/** Contexto da área do aluno/responsável: aluno selecionado já validado. */
export async function participantContext() {
  const { supabase, ctx } = await requireParticipant();
  const student = await currentStudent(ctx);
  const tz = ctx.organizations[0]?.timezone ?? "America/Sao_Paulo";
  const self = student.relation === "student";
  return {
    supabase, ctx, student, tz,
    restricted: student.restriction === "restrict_modules",
    /** "você" para o próprio aluno; primeiro nome para responsável. */
    who: self ? "você" : student.full_name.split(" ")[0],
  };
}
