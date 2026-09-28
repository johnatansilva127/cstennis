"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/status";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonClasses } from "@/components/ui/button";

const TEXT = {
  invite: {
    inputId: "invite-url",
    label: "Link de convite",
    title: "Link de convite para",
    body: "Ao abrir, a pessoa cria a própria senha.",
    share: "Seu acesso ao CS Tennis:",
    warning: "Este link aparece só agora. Se perder, gere um novo convite (o anterior é cancelado).",
  },
  password: {
    inputId: "password-url",
    label: "Link de nova senha",
    title: "Link de nova senha para",
    body: "Ao abrir, a pessoa cria uma nova senha.",
    share: "Crie sua nova senha do CS Tennis:",
    warning: "Este link aparece só agora e dá acesso à conta até ser usado. Se perder, gere outro (o anterior deixa de valer).",
  },
};

/** Exibe um link de uso único (mostrado uma única vez; o servidor não guarda o link). */
export function InviteLinkPanel({ url, expiresAt, who, kind = "invite" }: {
  url: string; expiresAt: string; who: string; kind?: "invite" | "password";
}) {
  const t = TEXT[kind];
  const [shared, setShared] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const expires = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
    .format(new Date(expiresAt));
  return (
    <div className="space-y-3 rounded-2xl border border-primary/40 bg-info-bg p-4">
      <p className="font-semibold text-text">{t.title} {who}</p>
      <p className="text-sm text-muted">
        Envie este link manualmente (por exemplo, pelo WhatsApp). Ele vale até {expires} e só pode ser usado uma vez. {t.body}
      </p>
      <label htmlFor={t.inputId} className="sr-only">{t.label}</label>
      <input id={t.inputId} readOnly value={url} onFocus={(e) => e.currentTarget.select()}
        className="block w-full rounded-xl border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-text" />
      <div className="flex flex-wrap gap-2">
        <CopyButton value={url} label="Copiar link" variant="primary" />
        {canShare ? (
          <button type="button" className={buttonClasses("secondary")}
            onClick={async () => {
              try {
                await navigator.share({ title: "CS Tennis", text: t.share, url });
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
      <Alert tone="warning">{t.warning}</Alert>
    </div>
  );
}
