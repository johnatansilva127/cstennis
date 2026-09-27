import { AlertTriangle, CheckCircle2, Circle, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";
import { cn } from "./cn";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-neutral-bg text-neutral",
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
};

export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const cls = cn("size-4 shrink-0", className);
  switch (tone) {
    case "success":
      return <CheckCircle2 aria-hidden className={cls} />;
    case "warning":
      return <AlertTriangle aria-hidden className={cls} />;
    case "danger":
      return <XCircle aria-hidden className={cls} />;
    case "info":
      return <Info aria-hidden className={cls} />;
    default:
      return <Circle aria-hidden className={cls} />;
  }
}

/** Status sempre com ícone + texto (nunca apenas cor). */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", toneClasses[tone], className)}>
      <ToneIcon tone={tone} className="size-3.5" />
      {children}
    </span>
  );
}

export function Alert({ tone = "info", title, children, className, live }: {
  tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; live?: boolean;
}) {
  const role = tone === "danger" ? "alert" : live ? "status" : undefined;
  return (
    <div role={role} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", toneClasses[tone], "border-current/20", className)}>
      <ToneIcon tone={tone} className="mt-0.5 size-5" />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-text/90 [&_a]:font-semibold [&_a]:underline">{children}</div> : null}
      </div>
    </div>
  );
}
