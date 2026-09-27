import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/ui/auth-card";
import { ActionForm, Hidden, TextField } from "@/components/ui/form";
import { Alert } from "@/components/ui/status";
import { getUserContext } from "@/lib/auth";
import { signInAction } from "./actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  const ctx = await getUserContext();
  if (ctx) redirect(ctx.is_coach ? (ctx.aal === "aal2" ? "/professor" : "/mfa") : "/app");
  const next = typeof params.next === "string" ? params.next : undefined;
  const reason = typeof params.motivo === "string" ? params.motivo : undefined;
  return (
    <AuthCard
      eyebrow="Acesso"
      title="Entrar no CS Tennis"
      footer={<p>Aluno ou responsável? Use o link de convite enviado pelo professor para criar seu acesso.</p>}
    >
      {reason === "senha" ? <Alert tone="success" className="mb-4">Senha atualizada. Entre com a nova senha.</Alert> : null}
      {reason === "sessao" ? <Alert tone="info" className="mb-4">Sua sessão terminou. Entre novamente.</Alert> : null}
      <ActionForm action={signInAction} submitLabel="Entrar" pendingLabel="Entrando…">
        {next ? <Hidden name="next" value={next} /> : null}
        <TextField name="email" type="email" label="E-mail" autoComplete="email" inputMode="email" required />
        <TextField name="password" type="password" label="Senha" autoComplete="current-password" required />
      </ActionForm>
      <p className="mt-5 text-sm">
        <Link href="/recuperar-senha" className="inline-flex min-h-11 items-center font-semibold text-link">Esqueci a senha</Link>
      </p>
    </AuthCard>
  );
}
