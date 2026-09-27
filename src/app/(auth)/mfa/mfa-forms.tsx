"use client";

import { useState, useTransition } from "react";
import { ActionForm, Hidden, TextField } from "@/components/ui/form";
import { Alert } from "@/components/ui/status";
import { buttonClasses } from "@/components/ui/button";
import { startEnrollAction, verifyMfaAction } from "./actions";

function CodeField() {
  return (
    <TextField name="code" label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code"
      pattern="[0-9]*" maxLength={6} required hint="Abra o aplicativo autenticador e digite o código atual." />
  );
}

export function MfaVerifyForm({ next }: { next: string }) {
  return (
    <ActionForm action={verifyMfaAction} submitLabel="Confirmar" pendingLabel="Verificando…">
      <Hidden name="next" value={next} />
      <CodeField />
    </ActionForm>
  );
}

export function MfaEnrollForm({ next }: { next: string }) {
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!enroll) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Para proteger os dados dos alunos, o acesso do professor exige verificação em duas etapas com um aplicativo
          autenticador (por exemplo, Google Authenticator, Microsoft Authenticator ou 1Password).
        </p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <button type="button" disabled={pending} className={buttonClasses("primary", "lg", true)}
          onClick={() => startTransition(async () => {
            try {
              const res = await startEnrollAction();
              if (res.ok && res.data) setEnroll(res.data);
              else setError(res.message ?? "Não foi possível iniciar.");
            } catch {
              setError("Falha de conexão. Tente novamente.");
            }
          })}>
          {pending ? "Preparando…" : "Configurar autenticador"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
        <li>No aplicativo autenticador, adicione uma conta lendo o QR Code abaixo.</li>
        <li>Se não conseguir ler, digite a chave manualmente.</li>
        <li>Informe o código de 6 dígitos gerado.</li>
      </ol>
      <div className="flex justify-center rounded-2xl bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enroll.qr} alt="QR Code para configurar o aplicativo autenticador" width={200} height={200} />
      </div>
      <div>
        <p className="label-caps text-muted">Chave manual</p>
        <p className="mt-1 break-all rounded-xl bg-surface-2 p-3 font-mono text-sm">{enroll.secret}</p>
      </div>
      <ActionForm action={verifyMfaAction} submitLabel="Ativar verificação em duas etapas" pendingLabel="Verificando…">
        <Hidden name="factorId" value={enroll.factorId} />
        <Hidden name="next" value={next} />
        <CodeField />
      </ActionForm>
    </div>
  );
}
