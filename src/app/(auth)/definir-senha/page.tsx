import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/ui/auth-card";
import { ActionForm, TextField } from "@/components/ui/form";
import { getClaims } from "@/lib/auth";
import { setPasswordAction } from "../redefinir-senha/actions";

export const metadata: Metadata = { title: "Crie sua senha" };

export default async function DefinePasswordPage() {
  if (!(await getClaims())) redirect("/entrar");
  return (
    <AuthCard eyebrow="Bem-vindo" title="Crie sua senha">
      <p className="mb-4 text-sm text-muted">Seu acesso foi ativado. Crie uma senha para entrar nas próximas vezes.</p>
      <ActionForm action={setPasswordAction} submitLabel="Criar senha e continuar" pendingLabel="Salvando…">
        <TextField name="password" type="password" label="Senha" autoComplete="new-password" required
          hint="Mínimo de 10 caracteres, com letras e números." />
        <TextField name="confirm" type="password" label="Repita a senha" autoComplete="new-password" required />
      </ActionForm>
    </AuthCard>
  );
}
