import { ActionForm, RadioGroupField, TextField } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/card";
import { changePasswordAction, signOutOthersAction, updateProfileAction } from "@/app/profile-actions";

export function ProfileForms({ fullName, theme }: { fullName: string; theme: string }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Perfil e aparência" />
        <ActionForm action={updateProfileAction} submitLabel="Salvar preferências">
          <TextField name="full_name" label="Seu nome" defaultValue={fullName} autoComplete="name" />
          <RadioGroupField name="theme" legend="Tema" defaultValue={theme} options={[
            { value: "system", label: "Automático", description: "Segue o tema do aparelho." },
            { value: "light", label: "Claro" },
            { value: "dark", label: "Escuro" },
          ]} />
        </ActionForm>
      </Card>
      <Card>
        <CardHeader title="Senha e sessões" />
        <ActionForm action={changePasswordAction} submitLabel="Trocar senha" resetOnSuccess>
          <TextField name="password" type="password" label="Nova senha" autoComplete="new-password" required hint="Mínimo de 10 caracteres, com letras e números." />
          <TextField name="confirm" type="password" label="Repita a nova senha" autoComplete="new-password" required />
        </ActionForm>
        <div className="mt-4 border-t border-border pt-4">
          <ActionForm action={signOutOthersAction} submitLabel="Encerrar sessões em outros aparelhos" submitVariant="secondary">
            <p className="text-sm text-muted">Use se você entrou em um aparelho que não é seu.</p>
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
