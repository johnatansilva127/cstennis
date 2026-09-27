import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/ui/auth-card";
import { getSupabase, getUserContext } from "@/lib/auth";
import { safeNext } from "@/lib/safe-redirect";
import { MfaEnrollForm, MfaVerifyForm } from "./mfa-forms";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const params = await searchParams;
  const ctx = await getUserContext();
  if (!ctx) redirect("/entrar");
  const next = safeNext(typeof params.next === "string" ? params.next : null, ctx.is_coach ? "/professor" : "/app");
  if (!ctx.is_coach && next.startsWith("/app")) redirect("/app");
  const supabase = await getSupabase();
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp ?? [];
  const stepUp = typeof params.confirmar === "string";
  if (level?.currentLevel === "aal2" && !stepUp) redirect(next);

  return (
    <AuthCard
      eyebrow="Segurança"
      title={verified.length > 0 ? "Confirme sua identidade" : "Ative a verificação em duas etapas"}
      footer={
        <p>
          Perdeu o acesso ao autenticador? Fale com o responsável técnico: a redefinição exige confirmação de identidade e
          fica registrada.
        </p>
      }
    >
      {verified.length > 0 ? <MfaVerifyForm next={next} /> : <MfaEnrollForm next={next} />}
      <form action="/auth/sair" method="post" className="mt-4">
        <button type="submit" className="min-h-11 text-sm font-semibold text-link">Sair</button>
      </form>
    </AuthCard>
  );
}
