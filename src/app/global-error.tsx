"use client";

import "./globals.css";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR" data-theme="system">
      <body className="min-h-dvh">
        <main className="mx-auto mt-[15vh] max-w-md px-4 text-center">
          <h1 className="font-display text-xl font-bold">Algo deu errado</h1>
          <p className="mt-2 text-sm text-muted">O CS Tennis encontrou um erro inesperado. Tente novamente.</p>
          <button type="button" onClick={() => retry()} className="mt-4 min-h-11 rounded-xl bg-primary-strong px-4 font-semibold text-on-primary">
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
