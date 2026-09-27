"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/errors";
import { Alert } from "./status";
import { buttonClasses } from "./button";
import { cn } from "./cn";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const FormCtx = createContext<{ state: ActionState; pending: boolean }>({ state: { ok: false }, pending: false });
export const useFormCtx = () => useContext(FormCtx);

const NETWORK_ERROR: ActionState = {
  ok: false,
  message: "Não foi possível falar com o servidor. Verifique sua conexão: seus dados foram mantidos no formulário.",
};

/**
 * Formulário com Server Action:
 *  - bloqueia envio duplo enquanto pendente;
 *  - só mostra sucesso após confirmação do servidor;
 *  - em erro (inclusive de rede) mantém os campos preenchidos;
 *  - mensagens em região aria-live.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Salvando…",
  resetOnSuccess = false,
  className,
  submitVariant = "primary",
  submitFull,
  hideSubmit,
  confirm,
  onSuccess,
  id,
}: {
  action: ServerAction;
  children: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  submitVariant?: "primary" | "secondary" | "danger" | "accent";
  submitFull?: boolean;
  hideSubmit?: boolean;
  confirm?: string;
  onSuccess?: (state: ActionState) => void;
  id?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    try {
      return await action(prev, fd);
    } catch {
      return NETWORK_ERROR;
    }
  }, { ok: false });

  useEffect(() => {
    if (state.redirectTo) {
      router.push(state.redirectTo);
      return;
    }
    if (state.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <FormCtx.Provider value={{ state, pending }}>
      <form
        id={id}
        ref={formRef}
        noValidate
        aria-busy={pending}
        className={cn("space-y-4", className)}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          if (confirm && !window.confirm(confirm)) return;
          // Inclui o botão que enviou (ex.: "salvar rascunho" x "publicar").
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const fd = new FormData(e.currentTarget, submitter && submitter.getAttribute("name") ? submitter : undefined);
          startTransition(() => dispatch(fd));
        }}
      >
        {children}
        <div aria-live="polite" aria-atomic="true">
          {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
        </div>
        {hideSubmit ? null : (
          <button type="submit" disabled={pending} className={buttonClasses(submitVariant, "lg", submitFull ?? true)}>
            {pending ? pendingLabel : submitLabel ?? "Salvar"}
          </button>
        )}
      </form>
    </FormCtx.Provider>
  );
}

export function SubmitButton({ children, pendingLabel = "Enviando…", variant = "primary", full, className, ...props }:
  ComponentProps<"button"> & { pendingLabel?: string; variant?: "primary" | "secondary" | "danger" | "accent" | "ghost"; full?: boolean }) {
  const { pending } = useFormCtx();
  return (
    <button type="submit" disabled={pending || props.disabled} className={buttonClasses(variant, "md", full, className)} {...props}>
      {pending ? pendingLabel : children}
    </button>
  );
}

function useFieldProps(name: string, defaultValue?: string | number | null) {
  const { state } = useFormCtx();
  const id = useId();
  const error = state.fieldErrors?.[name];
  const value = state.values && name in state.values ? state.values[name] : defaultValue ?? undefined;
  return { id, error, value: value === null ? undefined : value };
}

const inputClass =
  "block w-full min-h-12 rounded-xl border bg-surface px-3.5 py-2.5 text-base text-text placeholder:text-muted/70 " +
  "border-border-strong focus:border-primary focus:outline-none focus-visible:outline-3 focus-visible:outline-offset-1 " +
  "aria-[invalid=true]:border-danger disabled:opacity-60";

export function FieldShell({ id, label, hint, error, required, children, labelClassName }: {
  id: string; label: ReactNode; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode; labelClassName?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={cn("label-caps block text-muted", labelClassName)}>
        {label}
        {required ? <span aria-hidden className="text-danger"> *</span> : null}
        {required ? <span className="sr-only"> (obrigatório)</span> : null}
      </label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

export function TextField({ name, label, hint, required, defaultValue, className, ...props }:
  Omit<ComponentProps<"input">, "defaultValue"> & { name: string; label: ReactNode; hint?: ReactNode; defaultValue?: string | number | null }) {
  const { id, error, value } = useFieldProps(name, defaultValue);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        name={name}
        defaultValue={value}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputClass, className)}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({ name, label, hint, required, defaultValue, rows = 3, ...props }:
  Omit<ComponentProps<"textarea">, "defaultValue"> & { name: string; label: ReactNode; hint?: ReactNode; defaultValue?: string | null }) {
  const { id, error, value } = useFieldProps(name, defaultValue);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={value}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputClass, "min-h-24")}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({ name, label, hint, required, defaultValue, options, placeholder, ...props }:
  Omit<ComponentProps<"select">, "defaultValue"> & {
    name: string; label: ReactNode; hint?: ReactNode; defaultValue?: string | null;
    options: { value: string; label: string }[]; placeholder?: string;
  }) {
  const { id, error, value } = useFieldProps(name, defaultValue);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputClass, "pr-8")}
        {...props}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ name, label, hint, defaultChecked, value = "on" }: {
  name: string; label: ReactNode; hint?: ReactNode; defaultChecked?: boolean; value?: string;
}) {
  const { state } = useFormCtx();
  const id = useId();
  const checked = state.values && name in state.values ? state.values[name] === value : defaultChecked;
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" name={name} value={value} defaultChecked={checked}
        className="mt-1 size-5 shrink-0 accent-[var(--primary-strong)]" aria-describedby={hint ? `${id}-hint` : undefined} />
      <label htmlFor={id} className="min-h-11 text-sm text-text">
        {label}
        {hint ? <span id={`${id}-hint`} className="block text-xs text-muted">{hint}</span> : null}
      </label>
    </div>
  );
}

export function RadioGroupField({ name, legend, options, defaultValue, hint }: {
  name: string; legend: ReactNode; hint?: ReactNode; defaultValue?: string;
  options: { value: string; label: ReactNode; description?: ReactNode }[];
}) {
  const { state } = useFormCtx();
  const baseId = useId();
  const current = state.values && name in state.values ? state.values[name] : defaultValue;
  const error = state.fieldErrors?.[name];
  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${baseId}-error` : undefined}>
      <legend className="label-caps mb-1 text-muted">{legend}</legend>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <div className="grid gap-2">
        {options.map((o, i) => (
          <label key={o.value} htmlFor={`${baseId}-${i}`}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border-strong bg-surface px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-info-bg">
            <input id={`${baseId}-${i}`} type="radio" name={name} value={o.value} defaultChecked={current === o.value}
              className="mt-1 size-4 accent-[var(--primary-strong)]" />
            <span className="text-sm">
              <span className="font-semibold text-text">{o.label}</span>
              {o.description ? <span className="block text-xs text-muted">{o.description}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {error ? <p id={`${baseId}-error`} className="text-sm font-medium text-danger">{error}</p> : null}
    </fieldset>
  );
}

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
