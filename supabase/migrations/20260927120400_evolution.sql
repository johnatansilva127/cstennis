-- =============================================================================
-- Evolução técnica (avaliações, notas por fundamento, metas) e jogos dos alunos.
-- =============================================================================

create type public.assessment_status as enum ('draft', 'published');
create type public.tennis_skill as enum (
  'forehand', 'backhand', 'serve', 'return', 'volley', 'movement', 'consistency', 'decision_making'
);
create type public.goal_status as enum ('open', 'in_progress', 'achieved', 'dropped');
create type public.match_type as enum ('singles', 'doubles');
create type public.match_format as enum (
  'best_of_3', 'best_of_3_match_tiebreak', 'best_of_5', 'single_set', 'pro_set_8', 'short_sets_best_of_3', 'custom'
);
create type public.match_outcome as enum (
  'win', 'loss', 'incomplete', 'walkover_win', 'walkover_loss', 'retired_win', 'retired_loss'
);

-- -----------------------------------------------------------------------------
-- Avaliações
-- -----------------------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  assessed_on date not null,
  status public.assessment_status not null default 'draft',
  summary text check (summary is null or char_length(summary) <= 3000),
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  check (status = 'draft' or published_at is not null)
);
create index assessments_student_idx on public.assessments (student_id, assessed_on desc);

-- Nota explícita de 1 a 5; NULL = "não avaliado" (nunca zero).
create table public.assessment_scores (
  assessment_id uuid not null,
  organization_id uuid not null,
  skill public.tennis_skill not null,
  score smallint check (score is null or score between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  primary key (assessment_id, skill),
  foreign key (organization_id, assessment_id) references public.assessments (organization_id, id) on delete cascade
);

-- Observação privada do professor: tabela separada, nunca exposta ao aluno.
create table public.assessment_private_notes (
  assessment_id uuid primary key,
  organization_id uuid not null,
  note text not null check (char_length(note) <= 3000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, assessment_id) references public.assessments (organization_id, id) on delete cascade
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  description text not null check (char_length(description) between 3 and 500),
  target_date date,
  status public.goal_status not null default 'open',
  visible_to_student boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  achieved_at timestamptz,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict
);
create index goals_student_idx on public.goals (student_id);

-- -----------------------------------------------------------------------------
-- Jogos registrados pelo aluno/responsável
-- -----------------------------------------------------------------------------
create table public.student_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  played_on date not null,
  event_name text check (event_name is null or char_length(event_name) <= 120),
  opponent_name text not null check (char_length(opponent_name) between 1 and 80),
  match_type public.match_type not null default 'singles',
  partner_name text check (partner_name is null or char_length(partner_name) <= 80),
  opponent2_name text check (opponent2_name is null or char_length(opponent2_name) <= 80),
  format public.match_format not null,
  outcome public.match_outcome not null,
  outcome_source text not null check (outcome_source in ('computed', 'manual', 'declared')),
  comments text check (comments is null or char_length(comments) <= 2000),
  created_by uuid not null references auth.users (id) on delete restrict,
  author_kind text not null check (author_kind in ('student', 'guardian')),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  check (match_type = 'doubles' or (partner_name is null and opponent2_name is null))
);
create index student_matches_student_idx on public.student_matches (student_id, played_on desc);

create table public.match_sets (
  match_id uuid not null,
  organization_id uuid not null,
  set_number smallint not null check (set_number between 1 and 5),
  player_games smallint not null check (player_games between 0 and 99),
  opponent_games smallint not null check (opponent_games between 0 and 99),
  tiebreak_player smallint check (tiebreak_player is null or tiebreak_player between 0 and 99),
  tiebreak_opponent smallint check (tiebreak_opponent is null or tiebreak_opponent between 0 and 99),
  is_match_tiebreak boolean not null default false,
  primary key (match_id, set_number),
  foreign key (organization_id, match_id) references public.student_matches (organization_id, id) on delete cascade,
  check ((tiebreak_player is null) = (tiebreak_opponent is null))
);

create table public.match_coach_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  match_id uuid not null,
  author_user_id uuid not null references auth.users (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, match_id) references public.student_matches (organization_id, id) on delete restrict
);
create index match_coach_comments_match_idx on public.match_coach_comments (match_id, created_at);

-- -----------------------------------------------------------------------------
-- Validação de placar (regra autoritativa no servidor)
--
-- Formatos suportados e regra por set:
--   best_of_3 / best_of_5 / single_set: set até 6 games, tie-break em 6-6 (7-6)
--   best_of_3_match_tiebreak: 2 sets até 6; 3º set = match tie-break (10 pts, 2 de diferença)
--   pro_set_8: set único até 8 games, tie-break em 8-8 (9-8)
--   short_sets_best_of_3: sets até 4 games, tie-break em 4-4 (5-4)
--   custom: placar livre; resultado informado manualmente.
-- Tie-break comum: 7 pontos com 2 de diferença. Match tie-break: 10 pontos.
-- Retorna: 'player' | 'opponent' (vencedor do jogo) | 'none' (incompleto).
-- Lança CS422 se o placar for inconsistente para o formato.
-- -----------------------------------------------------------------------------
create or replace function private.valid_tiebreak(p_a int, p_b int, p_target int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select greatest(p_a, p_b) >= p_target
     and abs(p_a - p_b) >= 2
     and (greatest(p_a, p_b) = p_target or abs(p_a - p_b) = 2);
$$;

create or replace function private.evaluate_match_score(p_format public.match_format, p_sets jsonb, p_allow_partial_last boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_target int;
  v_sets_to_win int;
  v_max_sets int;
  v_n int := coalesce(jsonb_array_length(p_sets), 0);
  v_i int := 0;
  v_set jsonb;
  a int; b int; ta int; tb int; is_mtb boolean;
  v_player_sets int := 0;
  v_opp_sets int := 0;
  v_set_winner text;
begin
  if p_format = 'custom' then
    return 'none';
  end if;

  v_target := case p_format when 'pro_set_8' then 8 when 'short_sets_best_of_3' then 4 else 6 end;
  v_sets_to_win := case p_format when 'best_of_5' then 3 when 'single_set' then 1 when 'pro_set_8' then 1 else 2 end;
  v_max_sets := v_sets_to_win * 2 - 1;

  if v_n > v_max_sets then
    perform private.fail('CS422', 'Número de sets maior que o permitido para o formato.');
  end if;

  for v_set in select value from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) loop
    v_i := v_i + 1;
    if v_player_sets = v_sets_to_win or v_opp_sets = v_sets_to_win then
      perform private.fail('CS422', 'Há sets registrados depois de o jogo já estar decidido.');
    end if;
    a := (v_set ->> 'player_games')::int;
    b := (v_set ->> 'opponent_games')::int;
    ta := (v_set ->> 'tiebreak_player')::int;
    tb := (v_set ->> 'tiebreak_opponent')::int;
    is_mtb := coalesce((v_set ->> 'is_match_tiebreak')::boolean, false);
    v_set_winner := null;

    if is_mtb then
      if p_format <> 'best_of_3_match_tiebreak' or v_i <> 3 then
        perform private.fail('CS422', 'Match tie-break só é permitido como 3º set no formato com match tie-break.');
      end if;
      -- Match tie-break é informado nos campos de pontos (games = 1x0 simbólico).
      if ta is null or tb is null then
        perform private.fail('CS422', 'Informe os pontos do match tie-break.');
      end if;
      if private.valid_tiebreak(ta, tb, 10) then
        v_set_winner := case when ta > tb then 'player' else 'opponent' end;
      elsif not (p_allow_partial_last and v_i = v_n) then
        perform private.fail('CS422', 'Match tie-break inválido: vence quem chega a 10 pontos com 2 de diferença.');
      end if;
    else
      if p_format = 'best_of_3_match_tiebreak' and v_i = 3 then
        perform private.fail('CS422', 'No formato com match tie-break, o 3º set deve ser um match tie-break.');
      end if;
      if (a = v_target and b <= v_target - 2) or (b = v_target and a <= v_target - 2)
         or (a = v_target + 1 and b = v_target - 1) or (b = v_target + 1 and a = v_target - 1) then
        if ta is not null then
          perform private.fail('CS422', 'Tie-break informado em set que não chegou ao empate.');
        end if;
        v_set_winner := case when a > b then 'player' else 'opponent' end;
      elsif (a = v_target + 1 and b = v_target) or (b = v_target + 1 and a = v_target) then
        if ta is null or not private.valid_tiebreak(ta, tb, 7) or ((ta > tb) <> (a > b)) then
          perform private.fail('CS422', format('Set %s: informe um tie-break válido (7 pontos com 2 de diferença, vencido por quem ganhou o set).', v_i));
        end if;
        v_set_winner := case when a > b then 'player' else 'opponent' end;
      elsif p_allow_partial_last and v_i = v_n and a <= v_target and b <= v_target then
        v_set_winner := null; -- set interrompido
      else
        perform private.fail('CS422', format('Set %s com placar %s-%s é inválido para o formato.', v_i, a, b));
      end if;
    end if;

    if v_set_winner = 'player' then
      v_player_sets := v_player_sets + 1;
    elsif v_set_winner = 'opponent' then
      v_opp_sets := v_opp_sets + 1;
    end if;
  end loop;

  if v_player_sets = v_sets_to_win then
    return 'player';
  elsif v_opp_sets = v_sets_to_win then
    return 'opponent';
  end if;
  return 'none';
end;
$$;
