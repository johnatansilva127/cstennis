import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "md" | "sm" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors select-none " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary: "bg-primary-strong text-on-primary hover:bg-primary-strong-hover shadow-sm",
  secondary: "bg-surface text-text border border-border-strong hover:bg-surface-2",
  ghost: "text-link hover:bg-surface-2",
  danger: "bg-danger-bg text-danger border border-danger/40 hover:border-danger",
  accent: "bg-accent text-on-accent hover:brightness-95 shadow-sm",
};

// Todos os tamanhos respeitam alvo de toque mínimo de 44px.
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-6 text-base tracking-wide",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", full = false, className?: string) {
  return cn(base, variants[variant], sizes[size], full && "w-full", className);
}

export function Button({
  variant = "primary",
  size = "md",
  full,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <button type="button" className={buttonClasses(variant, size, full, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  full,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string; variant?: Variant; size?: Size; full?: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClasses(variant, size, full, className)} {...props}>
      {children}
    </Link>
  );
}
