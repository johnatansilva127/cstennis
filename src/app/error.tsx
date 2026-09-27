"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Apenas o identificador; nenhum dado sensível vai para o console.
    console.error("Erro de interface", error.digest ?? "");
  }, [error]);
  return (
    <main id="conteudo" className="mx-auto flex min-h-[60dvh] max-w-lg items-center px-4">
      <div className="w-full rounded-2xl border border-border bg-surface p-6 text-center shadow-card" role="alert">
        <AlertTriangle aria-hidden className="mx-auto mb-3 size-8 text-warning" />
        <h1 className="font-display text-xl font-bold">Algo deu errado</h1>
        <p className="mt-1 text-sm text-muted">Não foi possível carregar esta tela. Seus dados não foram alterados.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()}>Tentar novamente</Button>
          <ButtonLink href="/" variant="secondary">Ir para o início</ButtonLink>
        </div>
        {error.digest ? <p className="mt-3 text-xs text-muted">Código: {error.digest}</p> : null}
      </div>
    </main>
  );
}
