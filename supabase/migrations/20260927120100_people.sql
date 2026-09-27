-- =============================================================================
-- Pessoas: alunos (adultos e crianças), responsáveis, vínculos com contas de
-- acesso e convites. A pessoa/aluno é separada da identidade de autenticação.
-- =============================================================================

create type public.student_kind as enum ('adult', 'child');
create type public.student_status as enum ('active', 'paused', 'archived');
create type public.guardian_status as enum ('active', 'archived');
create type public.invitation_kind as enum ('student', 'guardian');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

-- -----------------------------------------------------------------------------
-- Alunos
-- -----------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 120),
  kind public.student_kind not null,
  status public.student_status not null default 'active',
  status_effective_date date not null default current_date,
  email text check (email is null or private.is_valid_email(email)),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()\-]{8,20}$'),
  level text check (level is null or char_length(level) <= 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  anonymized_at timestamptz,
  unique (organization_id, id),
  -- Adulto precisa de ao menos um contato; criança é contatada via responsável.
  constraint students_adult_contact check (kind = 'child' or anonymized_at is not null or email is not null or phone is not null)
);
create index students_org_idx on public.students (organization_id, status);

-- Histórico de status (ativo/pausado/arquivado) com data efetiva. A cobrança
-- mensal consulta o status vigente no primeiro dia da competência.
create table public.student_status_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  status public.student_status not null,
  effective_date date not null,
  reason text check (reason is null or char_length(reason) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict
);
create index student_status_changes_student_idx on public.student_status_changes (student_id, effective_date desc, created_at desc);

create or replace function private.student_status_on(p_student uuid, p_date date)
returns public.student_status
language sql
stable
security definer
set search_path = ''
as $$
  select c.status
    from public.student_status_changes c
   where c.student_id = p_student and c.effective_date <= p_date
   order by c.effective_date desc, c.created_at desc
   limit 1;
$$;

-- Observação administrativa privada: tabela separada, visível só ao professor.
create table public.student_private_notes (
  student_id uuid primary key,
  organization_id uuid not null,
  note text not null default '' check (char_length(note) <= 4000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict
);

-- -----------------------------------------------------------------------------
-- Responsáveis
-- -----------------------------------------------------------------------------
create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text check (email is null or private.is_valid_email(email)),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()\-]{8,20}$'),
  user_id uuid references auth.users (id) on delete restrict,
  status public.guardian_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint guardians_contact check (email is not null or phone is not null)
);
create unique index guardians_org_user_uidx on public.guardians (organization_id, user_id) where user_id is not null;
create unique index guardians_org_email_uidx on public.guardians (organization_id, email) where email is not null and status = 'active';

create table public.guardian_student_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  guardian_id uuid not null,
  student_id uuid not null,
  relationship text check (relationship is null or char_length(relationship) <= 40),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 500),
  foreign key (organization_id, guardian_id) references public.guardians (organization_id, id) on delete restrict,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict
);
create unique index guardian_student_links_active_uidx
  on public.guardian_student_links (guardian_id, student_id) where revoked_at is null;
create index guardian_student_links_student_idx on public.guardian_student_links (student_id) where revoked_at is null;

-- Conta de acesso de aluno adulto.
create table public.student_user_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  user_id uuid not null references auth.users (id) on delete restrict,
  invitation_id uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 500),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict
);
create unique index student_user_links_active_student_uidx on public.student_user_links (student_id) where revoked_at is null;
create unique index student_user_links_active_user_uidx on public.student_user_links (organization_id, user_id) where revoked_at is null;

-- Alunos acessíveis ao usuário atual: vínculo próprio (adulto) ou vínculo
-- explícito de responsável criado pelo professor. Exige vínculo ativo com a
-- organização.
create or replace function private.accessible_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.student_id
    from public.student_user_links l
    join public.organization_memberships m
      on m.organization_id = l.organization_id and m.user_id = l.user_id and m.status = 'active'
   where l.user_id = auth.uid() and l.revoked_at is null
  union
  select gl.student_id
    from public.guardians g
    join public.guardian_student_links gl on gl.guardian_id = g.id and gl.revoked_at is null
    join public.organization_memberships m
      on m.organization_id = g.organization_id and m.user_id = g.user_id and m.status = 'active'
   where g.user_id = auth.uid() and g.status = 'active';
$$;

create or replace function private.can_access_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.accessible_student_ids() s where s = p_student);
$$;

-- Papel do usuário atual em relação ao aluno ('student' | 'guardian' | null).
create or replace function private.relation_to_student(p_student uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.student_user_links l
                  where l.student_id = p_student and l.user_id = auth.uid() and l.revoked_at is null) then 'student'
    when exists (select 1 from public.guardians g
                   join public.guardian_student_links gl on gl.guardian_id = g.id and gl.revoked_at is null
                  where gl.student_id = p_student and g.user_id = auth.uid() and g.status = 'active') then 'guardian'
    else null
  end;
$$;

-- Usuários (contas) com acesso a um aluno — destinatários de avisos do aluno.
create or replace function private.student_recipient_user_ids(p_student uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.user_id
    from public.student_user_links l
    join public.organization_memberships m
      on m.organization_id = l.organization_id and m.user_id = l.user_id and m.status = 'active'
   where l.student_id = p_student and l.revoked_at is null
  union
  select g.user_id
    from public.guardian_student_links gl
    join public.guardians g on g.id = gl.guardian_id and g.status = 'active' and g.user_id is not null
    join public.organization_memberships m
      on m.organization_id = g.organization_id and m.user_id = g.user_id and m.status = 'active'
   where gl.student_id = p_student and gl.revoked_at is null;
$$;

-- -----------------------------------------------------------------------------
-- Convites (token aleatório; somente o hash SHA-256 é armazenado)
-- -----------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind public.invitation_kind not null,
  student_id uuid,
  guardian_id uuid,
  email text not null check (private.is_valid_email(email)),
  expires_at timestamptz not null,
  status public.invitation_status not null default 'pending',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  failed_attempts int not null default 0,
  codes_sent int not null default 0,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  foreign key (organization_id, guardian_id) references public.guardians (organization_id, id) on delete restrict,
  constraint invitations_target check (
    (kind = 'student' and student_id is not null and guardian_id is null)
    or (kind = 'guardian' and guardian_id is not null and student_id is null)
  )
);
create unique index invitations_pending_student_uidx on public.invitations (student_id) where status = 'pending' and student_id is not null;
create unique index invitations_pending_guardian_uidx on public.invitations (guardian_id) where status = 'pending' and guardian_id is not null;
create index invitations_org_idx on public.invitations (organization_id, created_at desc);

create table private.invitation_tokens (
  invitation_id uuid primary key references public.invitations (id) on delete restrict,
  token_hash bytea not null unique
);

create or replace function private.hash_token(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
$$;

create or replace function private.new_token()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 32 bytes aleatórios (CSPRNG do pgcrypto) em base64url sem padding.
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

create or replace function private.mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    else left(split_part(p_email, '@', 1), 1) || '***@' ||
         left(split_part(p_email, '@', 2), 1) || '***.' ||
         reverse(split_part(reverse(split_part(p_email, '@', 2)), '.', 1))
  end;
$$;
