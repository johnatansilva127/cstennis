"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Alert } from "@/components/ui/status";
import { buttonClasses } from "@/components/ui/button";
import { FieldShell } from "@/components/ui/form";
import { finalizeUploadAction, prepareUploadAction } from "./actions";

const ACCEPT = ["image/jpeg", "image/png", "application/pdf"];

function putWithProgress(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<number>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("network"));
    const body = new FormData();
    body.append("cacheControl", "0");
    body.append("", file);
    xhr.send(body);
  });
}

export function ProofUpload({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    if (!file) return setMsg({ ok: false, text: "Escolha o arquivo do comprovante." });
    if (!ACCEPT.includes(file.type)) return setMsg({ ok: false, text: "Envie uma imagem JPEG/PNG ou um PDF." });
    if (file.size > 10 * 1024 * 1024) return setMsg({ ok: false, text: "O arquivo precisa ter até 10 MB." });
    setBusy(true);
    try {
      const prep = await prepareUploadAction(invoiceId, { size: file.size, type: file.type, note });
      if (!prep.ok || !prep.data) return setMsg({ ok: false, text: prep.message ?? "Não foi possível enviar." });
      setProgress(0);
      const status = await putWithProgress(prep.data.signedUrl, file, setProgress);
      if (status < 200 || status >= 300) return setMsg({ ok: false, text: "Falha ao enviar o arquivo. Tente novamente." });
      const fin = await finalizeUploadAction(prep.data.fileId, file.name);
      setMsg({ ok: fin.ok, text: fin.message ?? "" });
      if (fin.ok) {
        setFile(null);
        setNote("");
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Falha de conexão. Seu arquivo continua selecionado; tente novamente." });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      <FieldShell id="proof-file" label="Arquivo do comprovante" hint="JPEG, PNG ou PDF, até 10 MB. O arquivo é verificado antes de chegar ao professor." required>
        <input ref={inputRef} id="proof-file" type="file" accept={ACCEPT.join(",")} disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          aria-describedby="proof-file-hint"
          className="block w-full rounded-xl border border-border-strong bg-surface p-2 text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:font-semibold" />
      </FieldShell>
      <FieldShell id="proof-note" label="Observação (opcional)">
        <textarea id="proof-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} disabled={busy}
          className="block w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5" />
      </FieldShell>
      {progress !== null ? (
        <progress value={progress} max={100} aria-label="Progresso do envio" className="h-2 w-full overflow-hidden rounded-full accent-[var(--primary)]">
          {progress}%
        </progress>
      ) : null}
      <div aria-live="polite">{msg ? <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert> : null}</div>
      <button type="submit" disabled={busy} className={buttonClasses("primary", "lg", true)}>
        <Upload aria-hidden className="size-4" /> {busy ? (progress !== null && progress < 100 ? `Enviando… ${progress}%` : "Verificando…") : "Enviar comprovante"}
      </button>
    </form>
  );
}
