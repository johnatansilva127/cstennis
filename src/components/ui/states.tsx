import { Inbox, Lock, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "./button";

export function EmptyState({ title, description, action, icon }: {
  title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <div className="mb-3 text-muted">{icon ?? <Inbox aria-hidden className="size-8" />}</div>
      <p className="font-display font-bold text-text">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function AccessDenied({ title = "Acesso não permitido", description, backHref = "/" }: {
  title?: string; description?: ReactNode; backHref?: string;
}) {
  return (
    <EmptyState
      icon={<Lock aria-hidden className="size-8" />}
      title={title}
      description={description ?? "Você não tem permissão para ver este conteúdo ou ele não existe."}
      action={<ButtonLink href={backHref} variant="secondary">Voltar ao início</ButtonLink>}
    />
  );
}

export function NotFoundState({ backHref = "/" }: { backHref?: string }) {
  return (
    <EmptyState
      icon={<SearchX aria-hidden className="size-8" />}
      title="Não encontramos esta página"
      description="O endereço pode estar incorreto, ou o conteúdo não está disponível para a sua conta."
      action={<ButtonLink href={backHref} variant="secondary">Voltar ao início</ButtonLink>}
    />
  );
}

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}
