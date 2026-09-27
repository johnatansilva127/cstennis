"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { buttonClasses } from "./button";

export function CopyButton({ value, label = "Copiar", copiedLabel = "Copiado!", variant = "secondary", full }: {
  value: string; label?: string; copiedLabel?: string; variant?: "primary" | "secondary" | "accent"; full?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  return (
    <>
      <button
        type="button"
        className={buttonClasses(variant, "md", full)}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus("copied");
            setTimeout(() => setStatus("idle"), 2500);
          } catch {
            setStatus("error");
          }
        }}
      >
        {status === "copied" ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        {status === "copied" ? copiedLabel : label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === "copied" ? copiedLabel : status === "error" ? "Não foi possível copiar; selecione o texto manualmente." : ""}
      </span>
      {status === "error" ? <p className="text-xs text-danger">Não foi possível copiar automaticamente. Selecione e copie o texto.</p> : null}
    </>
  );
}
