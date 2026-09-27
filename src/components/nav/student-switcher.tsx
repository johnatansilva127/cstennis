"use client";

import { startTransition, useActionState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { selectStudentAction } from "@/app/app/actions";

export function StudentSwitcher({ students, current, tone = "light" }: {
  students: { id: string; label: string }[]; current: string; tone?: "light" | "dark";
}) {
  const router = useRouter();
  const id = useId();
  const [state, dispatch, pending] = useActionState(selectStudentAction, { ok: false });
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  if (students.length < 2) return null;
  return (
    <form className="min-w-0">
      <label htmlFor={id} className="sr-only">Aluno em exibição</label>
      <select
        id={id}
        name="student_id"
        defaultValue={current}
        disabled={pending}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("student_id", e.target.value);
          startTransition(() => dispatch(fd));
        }}
        className={tone === "dark"
          ? "min-h-11 max-w-44 truncate rounded-xl border border-white/30 bg-white/10 px-3 text-sm font-semibold text-white [&>option]:text-black"
          : "min-h-11 max-w-64 rounded-xl border border-border-strong bg-surface px-3 text-sm font-semibold"}
      >
        {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </form>
  );
}
