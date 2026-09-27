-- =============================================================================
-- CS Tennis — Fundação: extensões, esquemas, tipos, helpers de autorização,
-- organizações, perfis, vínculos de organização, auditoria, outbox e rate limit.
--
-- Convenções:
--  * Todas as tabelas expostas ficam em `public`, com RLS habilitado e apenas
--    políticas de SELECT. Escritas acontecem exclusivamente por funções RPC
--    SECURITY DEFINER (search_path vazio) que validam identidade, papel,
--    vínculo e organização.
--  * Dados internos (tokens, outbox, limites, execução de jobs) ficam em
--    `private`, esquema que não é exposto pela API.
--  * Erros de negócio usam SQLSTATE 'CS4xx' com mensagem em pt-BR segura para
--    exibição.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
-- Necessário para que políticas RLS (avaliadas com o papel do usuário) chamem
-- os helpers. O esquema não é exposto pela API REST.
grant usage on schema private to authenticated, service_role;

-- Novos objetos não recebem privilégios automáticos para os papéis da API.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.membership_role as enum ('coach', 'participant');
create type public.membership_status as enum ('active', 'revoked');
create type public.theme_preference as enum ('system', 'light', 'dark');

-- -----------------------------------------------------------------------------
-- Helpers genéricos
-- -----------------------------------------------------------------------------
create or replace function private.fail(p_code text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = p_code, message = p_message;
end;
$$;

create or replace function private.is_valid_timezone(p_tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz);
$$;

create or replace function private.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(p_email)), '');
$$;

create or replace function private.is_valid_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
     and char_length(p_email) <= 254
     and p_email ~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$';
$$;

create or replace function private.clean_text(p_text text, p_max int)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(p_text), '');
begin
  if v is not null and char_length(v) > p_max then
    perform private.fail('CS422', format('Texto excede o limite de %s caracteres.', p_max));
  end if;
  return v;
end;
$$;

create or replace function private.current_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1');
$$;

-- Verifica se a sessão atual passou por TOTP nos últimos p_seconds segundos
-- (claim `amr` do JWT emitido pelo Supabase Auth). Usado para step-up em ações
-- sensíveis (troca de Pix, estorno, exclusão de dados).
create or replace function private.has_recent_mfa(p_seconds int)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select bool_or((a ->> 'method') = 'totp'
                    and (a ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - p_seconds)
       from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a),
    false)
  and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function private.require_recent_mfa()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.has_recent_mfa(900) then
    perform private.fail('CS428', 'Confirme novamente seu código de autenticação (MFA) para concluir esta ação.');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Organizações
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  timezone text not null default 'America/Sao_Paulo' check (private.is_valid_timezone(timezone)),
  invitation_ttl_hours int not null default 48 check (invitation_ttl_hours between 1 and 720),
  invoice_lead_days int not null default 10 check (invoice_lead_days between 0 and 28),
  default_travel_buffer_minutes int not null default 30 check (default_travel_buffer_minutes between 0 and 240),
  lesson_reminder_hours int not null default 24 check (lesson_reminder_hours between 1 and 72),
  due_soon_days int not null default 3 check (due_soon_days between 0 and 15),
  occurrence_window_days int not null default 90 check (occurrence_window_days between 28 and 366),
  proof_retention_days int check (proof_retention_days is null or proof_retention_days >= 30),
  privacy_controller text check (privacy_controller is null or char_length(privacy_controller) <= 200),
  privacy_contact text check (privacy_contact is null or char_length(privacy_contact) <= 200),
  contact_info text check (contact_info is null or char_length(contact_info) <= 500),
  created_at timestamptz not null default now()
);

-- Data civil local da organização num instante (fuso da organização).
create or replace function private.local_date_at(p_org uuid, p_instant timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_instant at time zone o.timezone)::date from public.organizations o where o.id = p_org;
$$;

create or replace function private.org_today(p_org uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.local_date_at(p_org, now());
$$;

create or replace function private.org_timezone(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.timezone from public.organizations o where o.id = p_org;
$$;

-- -----------------------------------------------------------------------------
-- Perfis de usuário (1:1 com auth.users)
-- -----------------------------------------------------------------------------
create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  theme_preference public.theme_preference not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, full_name)
  values (new.id, coalesce(left(btrim(new.raw_user_meta_data ->> 'full_name'), 120), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Vínculos usuário ↔ organização
-- -----------------------------------------------------------------------------
create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  role public.membership_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (organization_id, user_id)
);
create index organization_memberships_user_idx on public.organization_memberships (user_id);

-- Organizações onde o usuário atual é professor ativo COM sessão MFA (aal2).
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
     and m.status = 'active'
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function private.is_coach_of(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.coach_org_ids() o where o = p_org);
$$;

create or replace function private.require_coach(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform private.fail('CS401', 'Sessão expirada. Entre novamente.');
  end if;
  if p_org is null or not private.is_coach_of(p_org) then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
end;
$$;

-- Organização do professor atual (v1: um professor, uma organização).
create or replace function private.my_coach_org()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then
    perform private.fail('CS401', 'Sessão expirada. Entre novamente.');
  end if;
  select array_agg(o) into v_ids from private.coach_org_ids() o;
  if v_ids is null then
    perform private.fail('CS403', 'Acesso restrito ao professor com verificação em duas etapas concluída.');
  end if;
  if array_length(v_ids, 1) > 1 then
    perform private.fail('CS409', 'Mais de uma organização vinculada; não suportado nesta versão.');
  end if;
  return v_ids[1];
end;
$$;

create or replace function private.member_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.organization_memberships m
   where m.user_id = auth.uid() and m.status = 'active';
$$;

-- -----------------------------------------------------------------------------
-- Auditoria (somente inserção por funções confiáveis)
-- -----------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete restrict,
  actor_user_id uuid,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  student_id uuid,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_org_created_idx on public.audit_events (organization_id, created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);
create index audit_events_student_idx on public.audit_events (student_id) where student_id is not null;

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'CS403', message = 'Registros de auditoria são imutáveis.';
end;
$$;

create trigger audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function private.prevent_audit_mutation();

create or replace function private.audit(
  p_org uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_student_id uuid default null,
  p_diff jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := case
    when auth.uid() is null then 'system'
    when exists (select 1 from public.organization_memberships m
                  where m.user_id = auth.uid() and m.organization_id = p_org and m.role = 'coach') then 'coach'
    else 'participant'
  end;
  insert into public.audit_events (organization_id, actor_user_id, actor_role, action, entity_type, entity_id, student_id, diff)
  values (p_org, auth.uid(), v_role, p_action, p_entity_type, p_entity_id, p_student_id, coalesce(p_diff, '{}'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- Outbox transacional de eventos de domínio
-- -----------------------------------------------------------------------------
create table private.outbox_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index outbox_events_pending_idx on private.outbox_events (next_attempt_at) where status = 'pending';

create or replace function private.emit(p_org uuid, p_type text, p_payload jsonb, p_dedupe_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.outbox_events (organization_id, event_type, payload, dedupe_key)
  values (p_org, p_type, coalesce(p_payload, '{}'::jsonb), p_dedupe_key)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting (janela fixa) persistido no banco
-- -----------------------------------------------------------------------------
create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

create or replace function private.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

create or replace function private.enforce_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.hit_rate_limit(p_key, p_limit, p_window_seconds) then
    perform private.fail('CS429', 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.');
  end if;
end;
$$;

-- Chamada pelo servidor (service role) para limitar operações não autenticadas
-- (login, recuperação de senha, convites) por IP/identificador com hash.
create or replace function public.consume_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key is null or char_length(p_key) > 200 or p_limit < 1 or p_window_seconds < 1 then
    perform private.fail('CS422', 'Parâmetros inválidos.');
  end if;
  return private.hit_rate_limit(p_key, p_limit, p_window_seconds);
end;
$$;

-- -----------------------------------------------------------------------------
-- Execuções de jobs (monitoramento)
-- -----------------------------------------------------------------------------
create table private.job_runs (
  id bigint generated always as identity primary key,
  job_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  details jsonb not null default '{}'::jsonb,
  error text
);
create index job_runs_name_started_idx on private.job_runs (job_name, started_at desc);
