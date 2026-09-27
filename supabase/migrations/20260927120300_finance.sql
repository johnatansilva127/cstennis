-- =============================================================================
-- Financeiro: Pix manual, planos de mensalidade, cobranças (snapshots),
-- comprovantes (arquivos em quarentena), pagamentos confirmados, estornos,
-- políticas de restrição por atraso e liberações/bloqueios manuais.
--
-- Valores monetários SEMPRE em centavos inteiros (int). Nunca ponto flutuante.
-- =============================================================================

create type public.pix_key_type as enum ('cpf', 'cnpj', 'email', 'phone', 'evp');
create type public.invoice_status as enum ('open', 'under_review', 'paid', 'cancelled');
create type public.submission_status as enum ('uploading', 'received', 'under_review', 'approved', 'rejected', 'withdrawn');
create type public.payment_method as enum ('pix', 'cash', 'bank_transfer', 'other');
create type public.payment_source as enum ('submission', 'manual');
create type public.restriction_mode as enum ('warn_only', 'block_requests', 'restrict_modules');
create type public.override_kind as enum ('release', 'block_requests', 'restrict_modules');
create type public.file_status as enum ('pending_upload', 'stored', 'deleted');
create type public.scan_status as enum ('pending', 'clean', 'infected', 'error');

-- -----------------------------------------------------------------------------
-- Configuração Pix do professor (dados exibidos ao pagador)
-- -----------------------------------------------------------------------------
create table public.pix_settings (
  organization_id uuid primary key references public.organizations (id) on delete restrict,
  receiver_name text not null check (char_length(receiver_name) between 2 and 60),
  key_type public.pix_key_type not null,
  pix_key text not null check (char_length(pix_key) between 3 and 77),
  city text not null default 'SAO PAULO' check (char_length(city) between 2 and 15),
  brcode_enabled boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Planos de mensalidade individualizados (vigência por competência/mês)
-- -----------------------------------------------------------------------------
create table public.tuition_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  amount_cents int not null check (amount_cents > 0 and amount_cents <= 10000000),
  due_day smallint not null check (due_day between 1 and 31),
  starts_month date not null check (starts_month = date_trunc('month', starts_month)::date),
  ends_month date check (ends_month is null or ends_month = date_trunc('month', ends_month)::date),
  notes text check (notes is null or char_length(notes) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  check (ends_month is null or ends_month >= starts_month),
  constraint tuition_terms_no_overlap exclude using gist (
    student_id with =,
    daterange(starts_month, ends_month, '[]') with &&
  )
);

-- Dia de vencimento ajustado ao último dia de meses menores (29–31).
create or replace function private.due_date_for(p_competence date, p_due_day int)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    extract(year from p_competence)::int,
    extract(month from p_competence)::int,
    least(p_due_day, extract(day from (date_trunc('month', p_competence) + interval '1 month - 1 day'))::int)
  );
$$;

-- -----------------------------------------------------------------------------
-- Cobranças (snapshot de valor e vencimento)
-- -----------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  tuition_term_id uuid,
  competence date not null check (competence = date_trunc('month', competence)::date),
  amount_cents int not null check (amount_cents > 0 and amount_cents <= 10000000),
  original_amount_cents int not null check (original_amount_cents > 0),
  due_date date not null,
  status public.invoice_status not null default 'open',
  generated_by text not null check (generated_by in ('job', 'coach')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  adjusted_by uuid references auth.users (id) on delete set null,
  adjusted_at timestamptz,
  adjustment_reason text check (adjustment_reason is null or char_length(adjustment_reason) <= 300),
  cancelled_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  paid_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  foreign key (organization_id, tuition_term_id) references public.tuition_terms (organization_id, id) on delete restrict,
  check (status <> 'cancelled' or cancel_reason is not null),
  check (status <> 'paid' or paid_at is not null)
);
create unique index invoices_student_competence_uidx on public.invoices (student_id, competence) where status <> 'cancelled';
create index invoices_org_competence_idx on public.invoices (organization_id, competence);
create index invoices_org_status_due_idx on public.invoices (organization_id, status, due_date);

-- -----------------------------------------------------------------------------
-- Arquivos (comprovantes) — armazenamento privado, quarentena e verificação
-- -----------------------------------------------------------------------------
create table public.file_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  bucket text not null,
  object_path text not null unique,
  purpose text not null check (purpose in ('payment_proof')),
  detected_type text not null check (detected_type in ('jpeg', 'png', 'pdf')),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  image_width int,
  image_height int,
  status public.file_status not null default 'pending_upload',
  scan_status public.scan_status not null default 'pending',
  scan_engine text,
  scanned_at timestamptz,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text,
  unique (organization_id, id)
);
create index file_objects_pending_idx on public.file_objects (created_at) where status = 'pending_upload';

create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  student_id uuid not null,
  file_id uuid not null unique,
  submitted_by uuid not null references auth.users (id) on delete restrict,
  payer_note text check (payer_note is null or char_length(payer_note) <= 500),
  status public.submission_status not null default 'uploading',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  created_at timestamptz not null default now(),
  received_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete restrict,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  foreign key (organization_id, file_id) references public.file_objects (organization_id, id) on delete restrict,
  check (status <> 'rejected' or rejection_reason is not null)
);
create index payment_submissions_invoice_idx on public.payment_submissions (invoice_id, created_at desc);
create index payment_submissions_org_status_idx on public.payment_submissions (organization_id, status);

-- -----------------------------------------------------------------------------
-- Pagamentos confirmados (somente por aprovação do professor ou baixa manual)
-- -----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  student_id uuid not null,
  amount_cents int not null check (amount_cents > 0),
  paid_on date not null,
  method public.payment_method not null,
  source public.payment_source not null,
  submission_id uuid unique,
  justification text check (justification is null or char_length(justification) <= 500),
  idempotency_key uuid unique,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete restrict,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  foreign key (organization_id, submission_id) references public.payment_submissions (organization_id, id) on delete restrict,
  check (source <> 'manual' or justification is not null),
  check (source <> 'submission' or submission_id is not null)
);
-- No máximo um pagamento vigente (não estornado) por cobrança.
create unique index payments_active_invoice_uidx on public.payments (invoice_id) where reversed_at is null;
create index payments_org_paid_on_idx on public.payments (organization_id, paid_on);

create table public.payment_reversals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_id uuid not null unique,
  reason text not null check (char_length(reason) between 5 and 500),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id, payment_id) references public.payments (organization_id, id) on delete restrict
);

-- Pagamentos e estornos são imutáveis, exceto a marcação de estorno.
create or replace function private.protect_payments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'CS403', message = 'Pagamentos não podem ser apagados; use estorno.';
  end if;
  if old.reversed_at is not null then
    raise exception using errcode = 'CS409', message = 'Pagamento já estornado.';
  end if;
  if (new.amount_cents, new.invoice_id, new.student_id, new.paid_on, new.method, new.source, new.submission_id, new.created_by)
     is distinct from
     (old.amount_cents, old.invoice_id, old.student_id, old.paid_on, old.method, old.source, old.submission_id, old.created_by) then
    raise exception using errcode = 'CS403', message = 'Pagamentos confirmados não podem ser alterados; use estorno.';
  end if;
  return new;
end;
$$;

create trigger payments_protect
  before update or delete on public.payments
  for each row execute function private.protect_payments();

create trigger payment_reversals_immutable
  before update or delete on public.payment_reversals
  for each row execute function private.prevent_audit_mutation();

-- -----------------------------------------------------------------------------
-- Políticas de restrição por atraso e liberações/bloqueios manuais
-- -----------------------------------------------------------------------------
create table public.access_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  student_id uuid,
  mode public.restriction_mode not null default 'warn_only',
  grace_days int not null default 0 check (grace_days between 0 and 60),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict
);
create unique index access_policies_org_default_uidx on public.access_policies (organization_id) where student_id is null;
create unique index access_policies_student_uidx on public.access_policies (student_id) where student_id is not null;

create table public.access_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  kind public.override_kind not null,
  reason text not null check (char_length(reason) between 3 and 500),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 500),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  check (kind <> 'release' or expires_at is not null),
  check (expires_at is null or expires_at > starts_at)
);
create index access_overrides_student_idx on public.access_overrides (student_id, created_at desc);

-- Estado materializado apenas para avisos (o job detecta transições). A
-- autorização sempre recalcula em tempo real.
create table private.restriction_states (
  student_id uuid primary key,
  organization_id uuid not null,
  level text not null,
  updated_at timestamptz not null default now()
);

-- Cálculo puro da restrição de um aluno para uma data local.
--   level: none | warn | block_requests | restrict_modules
create or replace function private.compute_restriction(p_student uuid, p_today date)
returns table (
  level text,
  mode public.restriction_mode,
  grace_days int,
  overdue_count int,
  oldest_due_date date,
  effective_from date,
  override_kind public.override_kind,
  override_expires_at timestamptz,
  override_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_mode public.restriction_mode := 'warn_only';
  v_grace int := 0;
  v_late_count int;
  v_blocking_count int;
  v_oldest date;
  v_override public.access_overrides;
begin
  select s.organization_id into v_org from public.students s where s.id = p_student;
  if v_org is null then
    return;
  end if;

  select coalesce(sp.mode, op.mode, 'warn_only'), coalesce(sp.grace_days, op.grace_days, 0)
    into v_mode, v_grace
    from (select 1) x
    left join public.access_policies sp on sp.student_id = p_student
    left join public.access_policies op on op.organization_id = v_org and op.student_id is null;

  -- Em atraso: vencimento anterior à data local (em aberto ou em análise).
  select count(*)::int, min(i.due_date)
    into v_late_count, v_oldest
    from public.invoices i
   where i.student_id = p_student
     and i.status in ('open', 'under_review')
     and i.due_date < p_today;

  -- Bloqueia quando passou a tolerância: due_date + grace < hoje.
  select count(*)::int
    into v_blocking_count
    from public.invoices i
   where i.student_id = p_student
     and i.status in ('open', 'under_review')
     and i.due_date + v_grace < p_today;

  select * into v_override
    from public.access_overrides o
   where o.student_id = p_student
     and o.revoked_at is null
     and o.starts_at <= now()
     and (o.expires_at is null or o.expires_at > now())
   order by o.created_at desc
   limit 1;

  level := case
    when v_override.kind in ('block_requests', 'restrict_modules') then v_override.kind::text
    when v_override.kind = 'release' then case when v_late_count > 0 then 'warn' else 'none' end
    when v_blocking_count > 0 then case v_mode when 'warn_only' then 'warn' else v_mode::text end
    when v_late_count > 0 then 'warn'
    else 'none'
  end;
  mode := v_mode;
  grace_days := v_grace;
  overdue_count := v_late_count;
  oldest_due_date := v_oldest;
  effective_from := case when v_oldest is null then null else v_oldest + v_grace + 1 end;
  override_kind := v_override.kind;
  override_expires_at := v_override.expires_at;
  override_reason := v_override.reason;
  return next;
end;
$$;

create or replace function private.restriction_level(p_student uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.level
       from public.students s
       cross join lateral private.compute_restriction(s.id, private.org_today(s.organization_id)) r
      where s.id = p_student),
    'none');
$$;

-- Alunos acessíveis cujos módulos de aula/evolução estão liberados.
create or replace function private.module_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s from private.accessible_student_ids() s
   where private.restriction_level(s) <> 'restrict_modules';
$$;

create or replace function private.require_module_access(p_student uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_access_student(p_student) then
    perform private.fail('CS404', 'Registro não encontrado ou sem permissão.');
  end if;
  if private.restriction_level(p_student) = 'restrict_modules' then
    perform private.fail('CS423', 'Acesso temporariamente restrito por pendência financeira. Consulte a área Financeiro para regularizar.');
  end if;
end;
$$;

-- Registra mudança de nível e emite aviso quando há transição.
create or replace function private.refresh_restriction_state(p_student uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_level text;
  v_prev text;
begin
  select organization_id into v_org from public.students where id = p_student;
  if v_org is null then
    return null;
  end if;
  v_level := private.restriction_level(p_student);
  select level into v_prev from private.restriction_states where student_id = p_student for update;
  if v_prev is null then
    insert into private.restriction_states (student_id, organization_id, level) values (p_student, v_org, v_level);
    v_prev := 'none';
  elsif v_prev is distinct from v_level then
    update private.restriction_states set level = v_level, updated_at = now() where student_id = p_student;
  end if;
  if v_prev is distinct from v_level and v_level in ('block_requests', 'restrict_modules', 'none')
     and not (v_prev = 'warn' and v_level = 'none') then
    perform private.emit(v_org, 'restriction_changed',
      jsonb_build_object('student_id', p_student, 'level', v_level, 'previous', v_prev),
      format('restriction:%s:%s:%s', p_student, v_level, extract(epoch from now())::bigint));
  end if;
  return v_level;
end;
$$;

-- -----------------------------------------------------------------------------
-- Geração idempotente de cobranças
--
-- Para cada competência M em {mês atual, próximo mês}: gera se
--   * hoje >= vencimento(M) - antecedência configurada;
--   * o aluno está ATIVO no primeiro dia de M (histórico de status) — ou, se
--     entrou durante M, na data de entrada;
--   * existe plano vigente em M;
--   * não existe NENHUMA cobrança (inclusive cancelada) para aluno/competência.
-- Se a geração ocorrer após o vencimento teórico (ex.: plano criado no meio do
-- mês ou job atrasado), o vencimento passa a ser o próprio dia da geração.
-- -----------------------------------------------------------------------------
create or replace function private.generate_invoices(p_org uuid, p_today date)
returns table (invoice_id uuid, student_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead int;
begin
  select o.invoice_lead_days into v_lead from public.organizations o where o.id = p_org;

  return query
  with ins as (
    insert into public.invoices (organization_id, student_id, tuition_term_id, competence, amount_cents,
                                 original_amount_cents, due_date, generated_by)
    select t.organization_id, t.student_id, t.id, m.competence, t.amount_cents, t.amount_cents,
           greatest(private.due_date_for(m.competence, t.due_day), p_today), 'job'
      from (values (date_trunc('month', p_today)::date),
                   ((date_trunc('month', p_today) + interval '1 month')::date)) as m (competence)
      join public.tuition_terms t
        on t.organization_id = p_org
       and t.starts_month <= m.competence
       and (t.ends_month is null or t.ends_month >= m.competence)
      join public.students s on s.id = t.student_id and s.anonymized_at is null
      cross join lateral (select min(c.effective_date) as first_date
                            from public.student_status_changes c where c.student_id = t.student_id) f
     where p_today >= private.due_date_for(m.competence, t.due_day) - v_lead
       -- Status no 1º dia da competência; para aluno que entrou durante o mês,
       -- na data de entrada (primeira mensalidade integral por padrão).
       and f.first_date <= (m.competence + interval '1 month - 1 day')::date
       and private.student_status_on(t.student_id, greatest(m.competence, f.first_date)) = 'active'
       and not exists (select 1 from public.invoices i
                        where i.student_id = t.student_id and i.competence = m.competence)
    on conflict do nothing
    returning public.invoices.id, public.invoices.student_id
  )
  select ins.id, ins.student_id from ins;
end;
$$;
