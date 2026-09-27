import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/ui/auth-card";
import { ActionForm, TextField } from "@/components/ui/form";
import { Alert } from "@/components/ui/status";
import { requestResetAction } from "./actions";

export const metadata: Metadata = { title: "Recuperar senha" };

export default async function RecoverPage({ searchParams }: PageProps<"/recuperar-senha">) {
  const params = await searchParams;
  return (
    <AuthCard eyebrow="Acesso" title="Recuperar senha" footer={<Link href="/entrar" className="font-semibold text-white underline">Voltar para entrar</Link>}>
      {params.erro === "link" ? (
        <Alert tone="warning" className="mb-4">O link é inválido, já foi usado ou expirou. Peça um novo abaixo.</Alert>
      ) : null}
      <p className="mb-4 text-sm text-muted">Informe o e-mail da sua conta. Você receberá um link de uso único.</p>
      <ActionForm action={requestResetAction} submitLabel="Enviar link" pendingLabel="Enviando…">
        <TextField name="email" type="email" label="E-mail" autoComplete="email" inputMode="email" required />
      </ActionForm>
    </AuthCard>
  );
}
