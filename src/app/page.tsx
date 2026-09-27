import { redirect } from "next/navigation";
import { getUserContext } from "@/lib/auth";

export default async function Home() {
  const ctx = await getUserContext();
  if (!ctx) redirect("/entrar");
  if (ctx.is_coach) redirect(ctx.aal === "aal2" ? "/professor" : "/mfa");
  if (ctx.students.length > 0) redirect("/app");
  redirect("/acesso-negado");
}
