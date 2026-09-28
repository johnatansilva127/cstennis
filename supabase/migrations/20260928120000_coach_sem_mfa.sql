-- =============================================================================
-- Professor só com senha (decisão D18, 28/09/2026): sem exigência de TOTP (aal2)
-- para acessar os dados e sem step-up nas ações sensíveis.
-- `create or replace` mantém dono e permissões das funções.
-- =============================================================================

-- Organizações onde o usuário atual é professor ativo.
create or replace function private.coach_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.organization_memberships m
   where m.user_id = auth.uid()
     and m.role = 'coach'
     and m.status = 'active';
$$;

-- ponytail: no-op em vez de reescrever as 4 RPCs que a chamam (update_pix_settings,
-- reverse_payment, export_student_data, anonymize_student). Para voltar a exigir MFA
-- recente, restaure o corpo de 20260927120000_foundation.sql.
create or replace function private.require_recent_mfa()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  return;
end;
$$;
