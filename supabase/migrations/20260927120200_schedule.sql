-- =============================================================================
-- Agenda: locais, quadras, indisponibilidades, séries recorrentes (versionadas),
-- ocorrências concretas, matrículas, pedidos de vaga e presenças.
--
-- Datas civis (date) e horários locais (time) ficam separados de instantes
-- (timestamptz). O instante é calculado no fuso da organização.
-- =============================================================================

create type public.lesson_format as enum ('individual', 'double', 'group');
create type public.occurrence_status as enum ('scheduled', 'completed', 'cancelled');
create type public.enrollment_status as enum ('active', 'cancelled');
create type public.enrollment_source as enum ('direct', 'request', 'series_edit');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.attendance_status as enum ('present', 'absent', 'excused');

-- -----------------------------------------------------------------------------
-- Locais e quadras
-- -----------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  address text check (address is null or char_length(address) <= 300),
  instructions text check (instructions is null or char_length(instructions) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index locations_org_name_uidx on public.locations (organization_id, lower(name));

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  surface text check (surface is null or char_length(surface) <= 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (location_id, id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id) on delete restrict
);
create unique index courts_location_name_uidx on public.courts (location_id, lower(name));

-- Feriados / indisponibilidades (toda a organização ou um local).
create table public.unavailability_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  location_id uuid,
  starts_on date not null,
  ends_on date not null,
  reason text not null check (char_length(reason) between 2 and 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references public.locations (organization_id, id) on delete restrict,
  check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index unavailability_org_idx on public.unavailability_periods (organization_id, starts_on, ends_on);

-- -----------------------------------------------------------------------------
-- Séries recorrentes (versionadas). Uma edição "a partir de uma data" encerra a
-- versão atual na véspera e cria nova versão com o mesmo series_root_id.
-- -----------------------------------------------------------------------------
create table public.recurring_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  series_root_id uuid not null,
  previous_version_id uuid references public.recurring_slots (id) on delete restrict,
  title text check (title is null or char_length(title) <= 80),
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 = segunda … 7 = domingo
  start_time time not null,
  duration_minutes int not null check (duration_minutes between 15 and 300),
  valid_from date not null,
  valid_until date,
  format public.lesson_format not null,
  capacity smallint not null,
  location_id uuid not null,
  court_id uuid,
  travel_buffer_minutes int not null default 0 check (travel_buffer_minutes between 0 and 240),
  level text check (level is null or char_length(level) <= 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id) on delete restrict,
  foreign key (location_id, court_id) references public.courts (location_id, id) on delete restrict,
  constraint recurring_slots_valid_range check (valid_until is null or valid_until >= valid_from),
  constraint recurring_slots_same_day check (extract(epoch from start_time) / 60 + duration_minutes <= 1440),
  constraint recurring_slots_capacity check (
    (format = 'individual' and capacity = 1)
    or (format = 'double' and capacity = 2)
    or (format = 'group' and capacity between 2 and 40)
  ),
  constraint recurring_slots_lineage_no_overlap exclude using gist (
    series_root_id with =,
    daterange(valid_from, valid_until, '[]') with &&
  )
);
create index recurring_slots_org_weekday_idx on public.recurring_slots (organization_id, weekday);
create index recurring_slots_root_idx on public.recurring_slots (series_root_id, valid_from);

create or replace function private.set_series_root()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.series_root_id is null then
    new.series_root_id := new.id;
  end if;
  return new;
end;
$$;

create trigger recurring_slots_set_root
  before insert on public.recurring_slots
  for each row execute function private.set_series_root();

-- -----------------------------------------------------------------------------
-- Ocorrências concretas. Unicidade por linhagem da série + data original.
-- -----------------------------------------------------------------------------
create table public.lesson_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  series_id uuid not null,
  series_root_id uuid not null,
  original_date date not null,
  local_date date not null,
  start_time time not null,
  duration_minutes int not null check (duration_minutes between 15 and 300),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_id uuid not null,
  court_id uuid,
  format public.lesson_format not null,
  capacity smallint not null,
  travel_buffer_minutes int not null default 0,
  status public.occurrence_status not null default 'scheduled',
  is_exception boolean not null default false,
  exception_note text check (exception_note is null or char_length(exception_note) <= 300),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  cancelled_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (organization_id, id),
  unique (series_root_id, original_date),
  foreign key (organization_id, series_id) references public.recurring_slots (organization_id, id) on delete restrict,
  foreign key (organization_id, location_id) references public.locations (organization_id, id) on delete restrict,
  foreign key (location_id, court_id) references public.courts (location_id, id) on delete restrict,
  check (ends_at > starts_at),
  check (status <> 'cancelled' or cancel_reason is not null)
);
create index lesson_occurrences_org_date_idx on public.lesson_occurrences (organization_id, local_date);
create index lesson_occurrences_starts_idx on public.lesson_occurrences (organization_id, starts_at);

create or replace function private.local_instant(p_date date, p_time time, p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_date + p_time) at time zone p_tz;
$$;

create or replace function private.minutes_of(p_time time)
returns int
language sql
immutable
set search_path = ''
as $$
  select (extract(epoch from p_time) / 60)::int;
$$;

-- -----------------------------------------------------------------------------
-- Matrículas (vaga fixa na série; vigência em datas civis)
-- -----------------------------------------------------------------------------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  series_id uuid not null,
  series_root_id uuid not null,
  valid_from date not null,
  valid_until date,
  status public.enrollment_status not null default 'active',
  source public.enrollment_source not null default 'direct',
  request_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_by uuid references auth.users (id) on delete set null,
  ended_at timestamptz,
  end_reason text check (end_reason is null or char_length(end_reason) <= 300),
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  foreign key (organization_id, series_id) references public.recurring_slots (organization_id, id) on delete restrict,
  check (valid_until is null or valid_until >= valid_from),
  constraint enrollments_no_overlap exclude using gist (
    student_id with =,
    series_root_id with =,
    daterange(valid_from, valid_until, '[]') with &&
  ) where (status = 'active')
);
create index enrollments_series_idx on public.enrollments (series_id) where status = 'active';
create index enrollments_root_idx on public.enrollments (series_root_id) where status = 'active';
create index enrollments_student_idx on public.enrollments (student_id) where status = 'active';

-- Garante que a matrícula está dentro da vigência da versão da série e aponta
-- para a linhagem correta.
create or replace function private.check_enrollment_series()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_series public.recurring_slots;
begin
  select * into v_series from public.recurring_slots where id = new.series_id;
  if new.series_root_id is distinct from v_series.series_root_id then
    raise exception using errcode = 'CS422', message = 'Matrícula inconsistente com a série.';
  end if;
  if new.status = 'active' and (
       new.valid_from < v_series.valid_from
       or (v_series.valid_until is not null and (new.valid_until is null or new.valid_until > v_series.valid_until))
     ) then
    raise exception using errcode = 'CS422', message = 'A vigência da matrícula precisa estar dentro da vigência do horário.';
  end if;
  return new;
end;
$$;

create constraint trigger enrollments_series_check
  after insert or update on public.enrollments
  deferrable initially deferred
  for each row execute function private.check_enrollment_series();

-- -----------------------------------------------------------------------------
-- Pedidos de vaga (não ocupam vaga enquanto pendentes)
-- -----------------------------------------------------------------------------
create table public.enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  series_id uuid not null,
  series_root_id uuid not null,
  desired_start date not null,
  message text check (message is null or char_length(message) <= 500),
  requested_by uuid not null references auth.users (id) on delete restrict,
  status public.request_status not null default 'pending',
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 500),
  enrollment_id uuid,
  created_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  foreign key (organization_id, series_id) references public.recurring_slots (organization_id, id) on delete restrict,
  foreign key (organization_id, enrollment_id) references public.enrollments (organization_id, id) on delete restrict
);
create unique index enrollment_requests_pending_uidx
  on public.enrollment_requests (student_id, series_root_id) where status = 'pending';
create index enrollment_requests_org_status_idx on public.enrollment_requests (organization_id, status, created_at desc);

-- -----------------------------------------------------------------------------
-- Presenças (uma marcação por aluno/ocorrência; ausência de linha = não informado)
-- -----------------------------------------------------------------------------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  occurrence_id uuid not null,
  student_id uuid not null,
  status public.attendance_status not null,
  marked_by uuid references auth.users (id) on delete set null,
  marked_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (occurrence_id, student_id),
  foreign key (organization_id, occurrence_id) references public.lesson_occurrences (organization_id, id) on delete restrict,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict
);
create index attendance_student_idx on public.attendance (student_id);

-- -----------------------------------------------------------------------------
-- Roster: alunos matriculados numa ocorrência (pela linhagem e data original)
-- -----------------------------------------------------------------------------
create or replace function private.occurrence_roster(p_occurrence uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct e.student_id
    from public.lesson_occurrences o
    join public.enrollments e
      on e.series_root_id = o.series_root_id
     and e.status = 'active'
     and o.original_date between e.valid_from and coalesce(e.valid_until, 'infinity'::date)
   where o.id = p_occurrence;
$$;

-- Maior número de matrículas simultâneas numa série (versão) dentro do período.
create or replace function private.max_enrolled(p_series uuid, p_from date, p_to date, p_exclude uuid default null)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with points as (
    select p_from as pt
    union
    select e.valid_from
      from public.enrollments e
     where e.series_id = p_series and e.status = 'active'
       and e.valid_from > p_from
       and e.valid_from <= coalesce(p_to, 'infinity'::date)
  )
  select coalesce(max((
    select count(*)::int
      from public.enrollments e
     where e.series_id = p_series and e.status = 'active'
       and e.id is distinct from p_exclude
       and e.valid_from <= p.pt
       and coalesce(e.valid_until, 'infinity'::date) >= p.pt
  )), 0)
  from points p;
$$;

-- -----------------------------------------------------------------------------
-- Detecção de conflitos
--
-- Regra: duas aulas conflitam se os intervalos se sobrepõem. Em locais
-- diferentes exige-se ainda um intervalo mínimo de deslocamento igual ao maior
-- valor configurado entre as duas aulas. No mesmo local, aulas adjacentes são
-- permitidas. Quadra: sobreposição direta na mesma quadra.
-- -----------------------------------------------------------------------------
create or replace function private.times_conflict(
  a_start int, a_end int, a_location uuid, a_buffer int,
  b_start int, b_end int, b_location uuid, b_buffer int
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when a_location = b_location then a_start < b_end and b_start < a_end
    else a_start < b_end + greatest(a_buffer, b_buffer) and b_start < a_end + greatest(a_buffer, b_buffer)
  end;
$$;

-- Existe ao menos uma data com o dia da semana na interseção dos períodos?
create or replace function private.ranges_share_weekday(
  a_from date, a_until date, b_from date, b_until date, p_weekday int
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
      from generate_series(
             greatest(a_from, b_from),
             least(coalesce(a_until, 'infinity'::date), coalesce(b_until, 'infinity'::date), greatest(a_from, b_from) + 6),
             interval '1 day') d
     where extract(isodow from d)::int = p_weekday
  );
$$;

-- Conflitos de um padrão recorrente contra outras séries (professor, quadra),
-- ignorando a própria linhagem. Retorna descrições legíveis.
create or replace function private.series_conflicts(
  p_org uuid,
  p_weekday int,
  p_start time,
  p_duration int,
  p_from date,
  p_until date,
  p_location uuid,
  p_court uuid,
  p_buffer int,
  p_exclude_root uuid
)
returns table (kind text, description text)
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.court_id is not null and s.court_id = p_court
                   and private.minutes_of(s.start_time) < private.minutes_of(p_start) + p_duration
                   and private.minutes_of(p_start) < private.minutes_of(s.start_time) + s.duration_minutes
              then 'court' else 'coach' end,
         format('Conflita com o horário de %s às %s (%s)',
                to_char(s.start_time, 'HH24:MI'),
                to_char(s.start_time + make_interval(mins => s.duration_minutes), 'HH24:MI'),
                l.name)
    from public.recurring_slots s
    join public.locations l on l.id = s.location_id
   where s.organization_id = p_org
     and s.series_root_id is distinct from p_exclude_root
     and s.weekday = p_weekday
     and private.ranges_share_weekday(s.valid_from, s.valid_until, p_from, p_until, p_weekday)
     and (
       private.times_conflict(
         private.minutes_of(p_start), private.minutes_of(p_start) + p_duration, p_location, p_buffer,
         private.minutes_of(s.start_time), private.minutes_of(s.start_time) + s.duration_minutes, s.location_id, s.travel_buffer_minutes)
       or (s.court_id is not null and s.court_id = p_court
           and private.minutes_of(s.start_time) < private.minutes_of(p_start) + p_duration
           and private.minutes_of(p_start) < private.minutes_of(s.start_time) + s.duration_minutes)
     )
  union all
  -- Ocorrências avulsas remanejadas (exceções) que caem no padrão.
  select 'coach',
         format('Conflita com a aula remanejada de %s às %s',
                to_char(o.local_date, 'DD/MM/YYYY'), to_char(o.start_time, 'HH24:MI'))
    from public.lesson_occurrences o
   where o.organization_id = p_org
     and o.is_exception and o.status = 'scheduled'
     and o.series_root_id is distinct from p_exclude_root
     and extract(isodow from o.local_date)::int = p_weekday
     and o.local_date >= p_from and o.local_date <= coalesce(p_until, 'infinity'::date)
     and private.times_conflict(
           private.minutes_of(p_start), private.minutes_of(p_start) + p_duration, p_location, p_buffer,
           private.minutes_of(o.start_time), private.minutes_of(o.start_time) + o.duration_minutes, o.location_id, o.travel_buffer_minutes);
$$;

-- Conflitos de agenda do aluno: outras matrículas ativas (outras linhagens) com
-- sobreposição de datas e horário no mesmo dia da semana.
create or replace function private.student_conflicts(
  p_student uuid,
  p_weekday int,
  p_start time,
  p_duration int,
  p_from date,
  p_until date,
  p_location uuid,
  p_buffer int,
  p_exclude_root uuid
)
returns table (description text)
language sql
stable
security definer
set search_path = ''
as $$
  select format('Aluno já tem aula %s às %s (%s)',
                case s.weekday when 1 then 'segunda' when 2 then 'terça' when 3 then 'quarta' when 4 then 'quinta'
                               when 5 then 'sexta' when 6 then 'sábado' else 'domingo' end,
                to_char(s.start_time, 'HH24:MI'), l.name)
    from public.enrollments e
    join public.recurring_slots s on s.id = e.series_id
    join public.locations l on l.id = s.location_id
   where e.student_id = p_student
     and e.status = 'active'
     and e.series_root_id is distinct from p_exclude_root
     and s.weekday = p_weekday
     and private.ranges_share_weekday(e.valid_from, e.valid_until, p_from, p_until, p_weekday)
     and private.times_conflict(
           private.minutes_of(p_start), private.minutes_of(p_start) + p_duration, p_location, p_buffer,
           private.minutes_of(s.start_time), private.minutes_of(s.start_time) + s.duration_minutes, s.location_id, s.travel_buffer_minutes);
$$;

-- Conflitos de uma ocorrência concreta (data/hora específicas).
create or replace function private.concrete_conflicts(
  p_org uuid,
  p_date date,
  p_start time,
  p_duration int,
  p_location uuid,
  p_court uuid,
  p_buffer int,
  p_exclude_occurrence uuid,
  p_students uuid[]
)
returns table (kind text, description text)
language sql
stable
security definer
set search_path = ''
as $$
  -- Ocorrências já geradas nesse dia.
  select case when o.court_id is not null and o.court_id = p_court then 'court' else 'coach' end,
         format('Conflita com a aula das %s (%s)', to_char(o.start_time, 'HH24:MI'), l.name)
    from public.lesson_occurrences o
    join public.locations l on l.id = o.location_id
   where o.organization_id = p_org
     and o.local_date = p_date
     and o.status = 'scheduled'
     and o.id is distinct from p_exclude_occurrence
     and (
       private.times_conflict(
         private.minutes_of(p_start), private.minutes_of(p_start) + p_duration, p_location, p_buffer,
         private.minutes_of(o.start_time), private.minutes_of(o.start_time) + o.duration_minutes, o.location_id, o.travel_buffer_minutes)
     )
  union all
  -- Padrões ativos nessa data que ainda não geraram ocorrência.
  select 'coach',
         format('Conflita com o horário recorrente das %s (%s)', to_char(s.start_time, 'HH24:MI'), l.name)
    from public.recurring_slots s
    join public.locations l on l.id = s.location_id
   where s.organization_id = p_org
     and s.weekday = extract(isodow from p_date)::int
     and p_date between s.valid_from and coalesce(s.valid_until, 'infinity'::date)
     and not exists (select 1 from public.lesson_occurrences o
                      where o.series_root_id = s.series_root_id and o.original_date = p_date)
     and private.times_conflict(
           private.minutes_of(p_start), private.minutes_of(p_start) + p_duration, p_location, p_buffer,
           private.minutes_of(s.start_time), private.minutes_of(s.start_time) + s.duration_minutes, s.location_id, s.travel_buffer_minutes)
  union all
  -- Alunos da aula em outras aulas nesse dia.
  select 'student',
         format('%s já tem aula às %s', split_part(st.full_name, ' ', 1), to_char(o.start_time, 'HH24:MI'))
    from public.lesson_occurrences o
    join public.enrollments e
      on e.series_root_id = o.series_root_id and e.status = 'active'
     and o.original_date between e.valid_from and coalesce(e.valid_until, 'infinity'::date)
    join public.students st on st.id = e.student_id
   where o.organization_id = p_org
     and o.local_date = p_date
     and o.status = 'scheduled'
     and o.id is distinct from p_exclude_occurrence
     and e.student_id = any (p_students)
     and private.times_conflict(
           private.minutes_of(p_start), private.minutes_of(p_start) + p_duration, p_location, p_buffer,
           private.minutes_of(o.start_time), private.minutes_of(o.start_time) + o.duration_minutes, o.location_id, o.travel_buffer_minutes);
$$;

-- -----------------------------------------------------------------------------
-- Geração idempotente de ocorrências numa janela
-- -----------------------------------------------------------------------------
create or replace function private.generate_occurrences(p_org uuid, p_from date, p_to date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text := private.org_timezone(p_org);
  v_count int := 0;
  v_rows int;
begin
  insert into public.lesson_occurrences (
    organization_id, series_id, series_root_id, original_date, local_date, start_time, duration_minutes,
    starts_at, ends_at, location_id, court_id, format, capacity, travel_buffer_minutes,
    status, cancel_reason, cancelled_at
  )
  select s.organization_id, s.id, s.series_root_id, d::date, d::date, s.start_time, s.duration_minutes,
         private.local_instant(d::date, s.start_time, v_tz),
         private.local_instant(d::date, s.start_time, v_tz) + make_interval(mins => s.duration_minutes),
         s.location_id, s.court_id, s.format, s.capacity, s.travel_buffer_minutes,
         case when u.reason is null then 'scheduled' else 'cancelled' end::public.occurrence_status,
         u.reason,
         case when u.reason is null then null else now() end
    from public.recurring_slots s
    cross join lateral generate_series(greatest(s.valid_from, p_from), least(coalesce(s.valid_until, 'infinity'::date), p_to), interval '1 day') d
    left join lateral (
      select up.reason
        from public.unavailability_periods up
       where up.organization_id = s.organization_id
         and d::date between up.starts_on and up.ends_on
         and (up.location_id is null or up.location_id = s.location_id)
       order by up.created_at
       limit 1
    ) u on true
   where s.organization_id = p_org
     and extract(isodow from d)::int = s.weekday
  on conflict (series_root_id, original_date) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;
  return v_count;
end;
$$;
