import { describe, expect, it } from "vitest";
import { anonClient, sql } from "../helpers/db";

describe("Revisão automática das políticas de acesso", () => {
  it("todas as tabelas públicas têm RLS habilitado e forçado", async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`);
    expect(rows.length).toBeGreaterThan(30);
    for (const r of rows) {
      expect(r.relrowsecurity, r.relname).toBe(true);
      expect(r.relforcerowsecurity, r.relname).toBe(true);
    }
  });

  it("anon não tem privilégios em tabelas; authenticated só tem SELECT", async () => {
    const rows = await sql<{ grantee: string; table_name: string; privilege_type: string }>(`
      select grantee, table_name, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')`);
    expect(rows.filter((r) => r.grantee === "anon")).toEqual([]);
    expect(rows.filter((r) => r.privilege_type !== "SELECT")).toEqual([]);
  });

  it("nenhuma política permite escrita; todas as políticas são de SELECT", async () => {
    const rows = await sql<{ tablename: string; cmd: string }>(
      "select tablename, cmd from pg_policies where schemaname = 'public'");
    expect(rows.filter((r) => r.cmd !== "SELECT")).toEqual([]);
  });

  it("funções SECURITY DEFINER têm search_path fixo", async () => {
    const rows = await sql<{ proname: string; nspname: string }>(`
      select p.proname, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(rows).toEqual([]);
  });

  it("anon não executa nenhuma função pública; funções de servidor não são executáveis por usuários", async () => {
    const rows = await sql<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
    expect(rows).toEqual([]);
    const serverOnly = ["bootstrap_coach", "consume_rate_limit", "invitation_preview", "invitation_email_for_code", "invitation_email",
      "complete_payment_submission_upload", "fail_payment_submission_upload", "set_file_scan_result", "mark_file_deleted", "run_jobs_now"];
    const exec = await sql<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any($1) and has_function_privilege('authenticated', p.oid, 'execute')`, [serverOnly]);
    expect(exec).toEqual([]);
    const { error } = await anonClient().from("students").select("id");
    expect(error?.code).toBe("42501");
  });

  it("esquema private não é exposto pela API", async () => {
    const { error } = await anonClient().schema("private").from("outbox_events").select("*");
    expect(error).not.toBeNull();
  });

  it("jobs agendados no pg_cron", async () => {
    const rows = await sql<{ jobname: string; schedule: string }>("select jobname, schedule from cron.job order by jobname");
    expect(rows).toEqual([
      { jobname: "cstennis-daily", schedule: "10 * * * *" },
      { jobname: "cstennis-frequent", schedule: "* * * * *" },
    ]);
  });
});
