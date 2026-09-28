"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/status";
import { buttonClasses } from "@/components/ui/button";
import { ActionForm, TextField } from "@/components/ui/form";
import type { ActionState } from "@/lib/errors";
import {
  acceptInviteSignedInAction, activateInviteAction, loginAndAcceptInviteAction, previewInviteAction, signOutForInviteAction,
  type InvitePreview,
} from "./actions";

const STATUS_TEXT: Record<string, { title: string; body: string }> = {
  invalid: { title: "Link de convite inválido", body: "Confira se copiou o link completo ou peça um novo ao professor." },
  expired: { title: "Convite expirado", body: "Por segurança, convites valem por tempo limitado. Peça um novo link ao professor." },
  used: { title: "Convite já utilizado", body: "Este link já ativou um acesso. Se foi você, entre com seu e-mail e senha." },
  revoked: { title: "Convite cancelado", body: "O professor cancelou este convite. Peça um novo link." },
  locked: { title: "Convite bloqueado", body: "Houve tentativas com outra conta. Peça um novo link ao professor." },
  rate_limited: { title: "Muitas tentativas", body: "Aguarde alguns minutos e abra o link novamente." },
};

export function InviteFlow() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [step, setStep] = useState<"create" | "login">("create");
  const [feedback, setFeedback] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // O token vem no fragmento (#), que não é enviado ao servidor nem a logs;
    // em seguida é removido da barra de endereço e do histórico.
    const raw = window.location.hash.replace(/^#/, "");
    const t = new URLSearchParams(raw).get("t") ?? raw;
    if (raw) window.history.replaceState(null, "", window.location.pathname);
    previewInviteAction(t)
      .then((p) => {
        setToken(t);
        setPreview(p);
      })
      .catch(() => setPreview({ status: "rate_limited" }));
  }, []);

  function run(fn: () => Promise<ActionState>) {
    startTransition(async () => {
      try {
        const res = await fn();
        setFeedback(res);
        if (res.redirectTo) router.push(res.redirectTo);
      } catch {
        setFeedback({ ok: false, message: "Falha de conexão. Tente novamente." });
      }
    });
  }

  if (!preview) {
    return <p role="status" className="text-sm text-muted">Verificando convite…</p>;
  }
  if (preview.status !== "valid") {
    const info = STATUS_TEXT[preview.status] ?? STATUS_TEXT.invalid;
    return <Alert tone="warning" title={info.title}>{info.body}</Alert>;
  }

  const role = preview.kind === "guardian" ? "responsável" : "aluno";
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Você foi convidado(a) por <strong className="text-text">{preview.organization_name}</strong> para acessar o CS Tennis
        como <strong className="text-text">{role}</strong>.
      </p>

      <div aria-live="polite">
        {feedback?.message ? <Alert tone={feedback.ok ? "success" : "danger"}>{feedback.message}</Alert> : null}
      </div>

      {preview.session?.signedIn && preview.session.matches ? (
        <button type="button" disabled={pending} className={buttonClasses("primary", "lg", true)}
          onClick={() => run(() => acceptInviteSignedInAction(token!))}>
          {pending ? "Ativando…" : "Aceitar convite"}
        </button>
      ) : preview.session?.signedIn ? (
        <div className="space-y-3">
          <Alert tone="info">
            Você está conectado(a) com outra conta ({preview.session.email}). Saia para continuar com o e-mail do convite.
          </Alert>
          <button type="button" disabled={pending} className={buttonClasses("secondary", "lg", true)}
            onClick={() => run(async () => {
              await signOutForInviteAction();
              const p = await previewInviteAction(token!);
              setPreview(p);
              return { ok: true };
            })}>
            Sair desta conta
          </button>
        </div>
      ) : step === "create" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Seu login será o e-mail <strong className="text-text">{preview.email}</strong>. Crie uma senha para entrar.
          </p>
          <ActionForm action={activateInviteAction.bind(null, token!)} submitLabel="Criar senha e entrar" pendingLabel="Ativando…"
            onSuccess={(s) => {
              if ((s.data as { existingAccount?: boolean } | undefined)?.existingAccount) setStep("login");
            }}>
            <TextField name="password" type="password" label="Senha" autoComplete="new-password" required
              hint="Mínimo de 10 caracteres, com letras e números." />
            <TextField name="confirm" type="password" label="Repita a senha" autoComplete="new-password" required />
          </ActionForm>
        </div>
      ) : (
        <div className="space-y-3">
          <Alert tone="info">
            Já existe uma conta com o e-mail {preview.email}. Digite a senha que você já usa para aceitar o convite.
          </Alert>
          <ActionForm action={loginAndAcceptInviteAction.bind(null, token!)} submitLabel="Entrar e aceitar convite" pendingLabel="Entrando…">
            <TextField name="password" type="password" label="Senha" autoComplete="current-password" required />
          </ActionForm>
          <Link href="/recuperar-senha" className="inline-flex min-h-11 items-center text-sm font-semibold text-link">Esqueci a senha</Link>
        </div>
      )}
    </div>
  );
}
