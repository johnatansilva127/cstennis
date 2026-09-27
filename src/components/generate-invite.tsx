"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Alert } from "@/components/ui/status";
import { InviteLinkPanel } from "@/components/invite-link";
import type { ActionState } from "@/lib/errors";

export function GenerateInviteButton({ action, appUrl, who, label = "Gerar convite" }: {
  action: () => Promise<ActionState<{ token: string; expires_at: string }>>; appUrl: string; who: string; label?: string;
}) {
  const [result, setResult] = useState<ActionState<{ token: string; expires_at: string }> | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok && result.data) {
    return <InviteLinkPanel url={`${appUrl}/convite#${result.data.token}`} expiresAt={result.data.expires_at} who={who} />;
  }
  return (
    <div className="space-y-2">
      <button type="button" disabled={pending} className={buttonClasses("secondary")}
        onClick={() => start(async () => {
          try {
            setResult(await action());
          } catch {
            setResult({ ok: false, message: "Falha de conexão. Tente novamente." });
          }
        })}>
        <UserPlus aria-hidden className="size-4" /> {pending ? "Gerando…" : label}
      </button>
      {result && !result.ok ? <Alert tone="danger">{result.message}</Alert> : null}
    </div>
  );
}
