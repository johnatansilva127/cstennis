import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/ui/auth-card";
import { ActionForm, TextField } from "@/components/ui/form";
import { getClaims } from "@/lib/auth";
import { setPasswordAction } from "./actions";

export const metadata: Metadata = { title: "Nova senha" };

export default async function ResetPasswordPage() {
  if (!(await getClaims())) redirect("/recuperar-senha?erro=link");
  return (
    <AuthCard eyebrow="Acesso" title="Defina uma nova senha">
      <ActionForm action={setPasswordAction} submitLabel="Salvar nova senha" pendingLabel="Salvando…">
        <TextField name="password" type="password" label="Nova senha" autoComplete="new-password" required
          hint="Mínimo de 10 caracteres, com letras e números." />
        <TextField name="confirm" type="password" label="Repita a nova senha" autoComplete="new-password" required />
      </ActionForm>
    </AuthCard>
  );
}
