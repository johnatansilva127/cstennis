"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/status";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonClasses } from "@/components/ui/button";

/** Exibe o link de convite (mostrado uma única vez; o servidor guarda só o hash). */
export function InviteLinkPanel({ url, expiresAt, who }: { url: string; expiresAt: string; who: string }) {
  const [shared, setShared] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const expires = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
    .format(new Date(expiresAt));
  return (
    <div className="space-y-3 rounded-2xl border border-primary/40 bg-info-bg p-4">
      <p className="font-semibold text-text">Link de convite para {who}</p>
      <p className="text-sm text-muted">
        Envie este link manualmente (por exemplo, pelo WhatsApp). Ele vale até {expires}, só pode ser usado uma vez e exige
        confirmação por código enviado ao e-mail cadastrado.
      </p>
      <label htmlFor="invite-url" className="sr-only">Link de convite</label>
      <input id="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()}
        className="block w-full rounded-xl border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-text" />
      <div className="flex flex-wrap gap-2">
        <CopyButton value={url} label="Copiar link" variant="primary" />
        {canShare ? (
          <button type="button" className={buttonClasses("secondary")}
            onClick={async () => {
              try {
                await navigator.share({ title: "Convite CS Tennis", text: "Seu acesso ao CS Tennis:", url });
                setShared(true);
              } catch {
                /* compartilhamento cancelado */
              }
            }}>
            <Share2 aria-hidden className="size-4" /> Compartilhar…
          </button>
        ) : null}
      </div>
      {shared ? <p role="status" className="text-sm text-success">Compartilhamento aberto no aparelho.</p> : null}
      <Alert tone="warning">Este link aparece só agora. Se perder, gere um novo convite (o anterior é cancelado).</Alert>
    </div>
  );
}
