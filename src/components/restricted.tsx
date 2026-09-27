import { Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/** Área de regularização: módulos restritos por pendência financeira. */
export function RestrictedNotice({ who }: { who: string }) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-bg p-6 text-center">
      <Lock aria-hidden className="mx-auto mb-3 size-8 text-danger" />
      <h2 className="font-display text-lg font-bold text-text">Acesso temporariamente restrito</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-text/80">
        Há mensalidade em atraso{who !== "você" ? ` de ${who}` : ""}. Aulas e evolução voltam a aparecer assim que o pagamento for
        confirmado pelo professor. Você continua podendo ver a dívida, copiar o Pix e enviar o comprovante.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <ButtonLink href="/app/financeiro">Ir para mensalidades</ButtonLink>
      </div>
    </div>
  );
}
