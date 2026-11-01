-- Differentiale NL (dagelijkse Eredivisie-puzzel): alles voor Supabase in één script.
-- Plak dit in Supabase → SQL Editor → New query → Run. Het is veilig om het opnieuw te draaien.
-- Alle namen beginnen met dn_.
--
-- Beveiliging (belangrijk voor een publiek spel):
-- * Tabellen zijn NIET leesbaar of schrijfbaar met de publieke (anon/publishable) sleutel. Alles loopt via de
--   functies hieronder; die controleren de speler met de geheime code op diens toestel.
-- * Het antwoord van de dag staat alleen in dn_answers op de server. De volgorde wordt hier met random()
--   gekozen (dn_plan) en staat NOOIT in de repository. De telefoon krijgt het antwoord pas als het spel klaar is.
-- * De score rekent de server zelf uit.
--
-- Startdatum: dag 0 = START_DATE hieronder. Moet gelijk zijn aan START in src/app.js.

-- ---------- Tabellen ----------
create table if not exists public.dn_players (
  id          uuid primary key default gen_random_uuid(),
  secret      uuid not null default gen_random_uuid(),
  recovery    text not null unique,                 -- herstelcode, 12 tekens
  name        text not null check (char_length(name) between 1 and 24),
  tag         text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.dn_leagues (
  code        text primary key check (code ~ '^[A-Z0-9]{6}$'),
  name        text not null check (char_length(name) between 1 and 30),
  created_by  uuid references public.dn_players(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.dn_members (
  player_id   uuid not null references public.dn_players(id) on delete cascade,
  league_code text not null references public.dn_leagues(code) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (player_id, league_code)
);

-- Spelersgegevens (bijgewerkt door de GitHub Action, stand na de laatst afgeronde speelronde)
create table if not exists public.dn_stats (
  code        int primary key,                      -- vaste spelerscode uit de databron
  web         text not null,
  team        int not null,
  pos         int not null,                         -- 1 keeper, 2 verdediger, 3 middenvelder, 4 aanvaller
  price       int not null,                         -- in tienden: 62 = € 6,2 mln
  own         numeric not null,                     -- eigendom in procenten
  pts         int not null,                         -- seizoenspunten
  gw          int not null,                         -- punten in de laatst afgeronde speelronde
  goals       int not null default 0,
  assists     int not null default 0,
  updated_at  timestamptz not null default now()
);

-- Antwoord per speldag. Wordt vooruit gevuld door dn_plan (willekeurig, zonder herhaling binnen 180 dagen).
create table if not exists public.dn_answers (
  day         int primary key,
  code        int not null,
  planned_at  timestamptz not null default now()
);

create table if not exists public.dn_meta (
  key         text primary key,
  value       jsonb not null
);

-- Eén spel per speler per dag
create table if not exists public.dn_games (
  player_id   uuid not null references public.dn_players(id) on delete cascade,
  day         int  not null,
  guesses     int[] not null default '{}',
  hints       int  not null default 0,
  done        boolean not null default false,
  won         boolean not null default false,
  gave_up     boolean not null default false,
  points      int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (player_id, day)
);

create index if not exists dn_games_day_idx on public.dn_games(day);
create index if not exists dn_members_league_idx on public.dn_members(league_code);

alter table public.dn_players enable row level security;
alter table public.dn_leagues enable row level security;
alter table public.dn_members enable row level security;
alter table public.dn_stats   enable row level security;
alter table public.dn_answers enable row level security;
alter table public.dn_meta    enable row level security;
alter table public.dn_games   enable row level security;
revoke all on public.dn_players, public.dn_leagues, public.dn_members, public.dn_stats,
              public.dn_answers, public.dn_meta, public.dn_games from anon, authenticated;

-- ---------- Interne hulpfuncties ----------
-- Speldag volgens de Nederlandse kalender (dag 0 = START_DATE)
create or replace function public.dn_today() returns int
language sql stable as $$
  select ((now() at time zone 'Europe/Amsterdam')::date - date '2026-11-01')::int   -- START_DATE
$$;

-- Week (maandag t/m zondag), geteld vanaf START_DATE
create or replace function public.dn_week(p_day int) returns int
language sql immutable as $$
  select floor((p_day + extract(isodow from date '2026-11-01')::int - 1) / 7.0)::int   -- START_DATE
$$;

-- Willekeurige code zonder verwarrende tekens (geen O/0, I/1)
create or replace function public.dn_code(p_len int) returns text
language sql volatile as $$
  with u as (select decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex') b)
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(u.b, i) % 32), 1), '' order by i)
  from u, unnest(array[0,1,2,3,4,5,10,11,12,13,14,15,16,17,18,19,20,21,26,27,28,29,30,31]) with ordinality t(i, ord)
  where ord <= p_len
$$;

create or replace function public.dn_check(p_player uuid, p_secret uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from dn_players where id = p_player and secret = p_secret) then
    raise exception 'Onbekende speler';
  end if;
end $$;

create or replace function public.dn_answer(p_day int) returns int
language sql stable security definer set search_path = public as $$
  select code from dn_answers where day = p_day
$$;

create or replace function public.dn_num(g numeric, a numeric, tol numeric) returns jsonb
language sql immutable as $$
  select case when a = g then jsonb_build_object('c', 'exact')
              else jsonb_build_object('c', case when abs(a - g) <= tol then 'close' else 'miss' end,
                                      'd', case when a > g then 1 else -1 end) end
$$;

-- Marges voor 'dichtbij' (geel). Houd gelijk met TOL in src/app.js.
create or replace function public.dn_cmp(g public.dn_stats, a public.dn_stats) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'team',  jsonb_build_object('c', case when g.team = a.team then 'exact' else 'miss' end),
    'pos',   jsonb_build_object('c', case when g.pos  = a.pos  then 'exact' else 'miss' end),
    'price', public.dn_num(g.price, a.price, 10),
    'own',   public.dn_num(g.own,   a.own,   8),
    'pts',   public.dn_num(g.pts,   a.pts,   10),
    'gw',    public.dn_num(g.gw,    a.gw,    3))
$$;

create or replace function public.dn_json(f public.dn_stats) returns jsonb
language sql immutable as $$
  select jsonb_build_object('code', f.code, 'web', f.web, 'team', f.team, 'pos', f.pos,
                            'price', f.price, 'own', f.own, 'pts', f.pts, 'gw', f.gw)
$$;

-- Eerste letter van de achternaam (hint 2), zonder accenten
create or replace function public.dn_initial(p_web text) returns text
language sql immutable as $$
  select upper(left(translate(regexp_replace(coalesce(p_web, ''), '^(van der |van den |van de |van |de |den |der |ter |ten |te |el |al )', '', 'i'),
         'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿŠšŽž',
         'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyySsZz'), 1))
$$;

-- Huidige reeks en beste reeks (aaneengesloten geraden dagen)
create or replace function public.dn_streak(p_player uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare d int := dn_today(); n int := 0;
begin
  if exists (select 1 from dn_games where player_id = p_player and day = d and done and not won) then return 0; end if;
  if not exists (select 1 from dn_games where player_id = p_player and day = d and won) then d := d - 1; end if;
  while exists (select 1 from dn_games where player_id = p_player and day = d and won) loop
    n := n + 1; d := d - 1;
  end loop;
  return n;
end $$;

create or replace function public.dn_best(p_player uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(cnt), 0)::int from (
    select count(*) cnt from (
      select day - row_number() over (order by day) grp from dn_games where player_id = p_player and won
    ) x group by grp) y
$$;

-- Alles wat de telefoon over het spel van vandaag mag weten
create or replace function public.dn_state(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d int := dn_today(); g dn_games; a dn_stats; v_rows jsonb; v_hint jsonb;
begin
  select * into g from dn_games where player_id = p_player and day = d;
  select * into a from dn_stats where code = dn_answer(d);
  if a.code is null then raise exception 'De puzzel van vandaag is nog niet klaar. Probeer het zo opnieuw.'; end if;
  select coalesce(jsonb_agg(dn_json(f) || jsonb_build_object('fb', dn_cmp(f, a)) order by x.ord), '[]'::jsonb)
    into v_rows
    from unnest(coalesce(g.guesses, '{}'::int[])) with ordinality x(code, ord) join dn_stats f on f.code = x.code;
  -- Hint 1: goals en assists dit seizoen. Hint 2: eerste letter van de achternaam.
  if coalesce(g.hints, 0) >= 1 then
    v_hint := jsonb_build_object('goals', a.goals, 'assists', a.assists,
                                 'initial', case when g.hints >= 2 then dn_initial(a.web) end);
  end if;
  return jsonb_build_object(
    'day', d, 'rows', v_rows, 'hints', coalesce(g.hints, 0), 'hint', v_hint,
    'done', coalesce(g.done, false), 'won', coalesce(g.won, false), 'gave_up', coalesce(g.gave_up, false),
    'points', coalesce(g.points, 0),
    'answer', case when g.done then dn_json(a) end,
    'round', (select (value #>> '{}')::int from dn_meta where key = 'round'),
    'stats', jsonb_build_object(
      'played', (select count(*) from dn_games where player_id = p_player and done),
      'won', (select count(*) from dn_games where player_id = p_player and won),
      'streak', dn_streak(p_player), 'best', dn_best(p_player),
      -- gokverdeling: [1/6 .. 6/6, niet geraden]
      'dist', (select jsonb_build_array(
                 count(*) filter (where won and cardinality(guesses) = 1), count(*) filter (where won and cardinality(guesses) = 2),
                 count(*) filter (where won and cardinality(guesses) = 3), count(*) filter (where won and cardinality(guesses) = 4),
                 count(*) filter (where won and cardinality(guesses) = 5), count(*) filter (where won and cardinality(guesses) = 6),
                 count(*) filter (where not won))
               from dn_games where player_id = p_player and done)),
    -- hoe deed iedereen het vandaag (pas zichtbaar als je zelf klaar bent)
    'today', case when g.done then (select jsonb_build_object('played', count(*), 'won', count(*) filter (where won))
                                      from dn_games where day = d and done) end);
end $$;

-- ---------- Functies voor de telefoon ----------
create or replace function public.dn_create_player(p_name text)
returns table (player_id uuid, secret uuid, recovery text, tag text)
language plpgsql security definer set search_path = public as $$
declare v_rec text;
begin
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 24 then raise exception 'Kies een naam van 1 tot 24 tekens'; end if;
  loop
    v_rec := dn_code(12);
    exit when not exists (select 1 from dn_players p where p.recovery = v_rec);
  end loop;
  return query
    insert into dn_players(name, tag, recovery)
    values (trim(p_name), lpad((floor(random() * 9000) + 1000)::int::text, 4, '0'), v_rec)
    returning dn_players.id, dn_players.secret, dn_players.recovery, dn_players.tag;
end $$;

create or replace function public.dn_restore(p_recovery text)
returns table (player_id uuid, secret uuid, name text, tag text)
language plpgsql security definer set search_path = public as $$
declare v_code text := upper(regexp_replace(coalesce(p_recovery, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  perform pg_sleep(0.3);  -- remt raden af
  return query select p.id, p.secret, p.name, p.tag from dn_players p where p.recovery = v_code;
  if not found then raise exception 'Onbekende herstelcode'; end if;
end $$;

create or replace function public.dn_rename(p_player uuid, p_secret uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dn_check(p_player, p_secret);
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 24 then raise exception 'Kies een naam van 1 tot 24 tekens'; end if;
  update dn_players set name = trim(p_name) where id = p_player;
end $$;

create or replace function public.dn_get(p_player uuid, p_secret uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p dn_players;
begin
  perform dn_check(p_player, p_secret);
  select * into p from dn_players where id = p_player;
  return dn_state(p_player) || jsonb_build_object(
    'me', jsonb_build_object('name', p.name, 'tag', p.tag, 'recovery', p.recovery),
    'leagues', coalesce((select jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name) order by m.joined_at)
                         from dn_members m join dn_leagues l on l.code = m.league_code where m.player_id = p_player), '[]'::jsonb));
end $$;

create or replace function public.dn_guess(p_player uuid, p_secret uuid, p_code int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d int := dn_today(); g dn_games; v_ans int := dn_answer(d); v_n int; v_won boolean; v_done boolean;
begin
  perform dn_check(p_player, p_secret);
  if v_ans is null then raise exception 'De puzzel van vandaag is nog niet klaar. Probeer het zo opnieuw.'; end if;
  if not exists (select 1 from dn_stats where code = p_code) then raise exception 'Onbekende speler'; end if;
  insert into dn_games(player_id, day) values (p_player, d) on conflict do nothing;
  select * into g from dn_games where player_id = p_player and day = d for update;
  if g.done or p_code = any(g.guesses) then return dn_state(p_player); end if;
  v_n := cardinality(g.guesses) + 1;
  v_won := (p_code = v_ans);
  v_done := v_won or v_n >= 6;
  update dn_games
     set guesses = g.guesses || p_code, done = v_done, won = v_won,
         points = case when v_won then greatest(0, 70 - 10 * v_n - 5 * g.hints) else 0 end,
         updated_at = now()
   where player_id = p_player and day = d;
  return dn_state(p_player);
end $$;

-- Hint: stap 1 = goals en assists, stap 2 = eerste letter achternaam. Elke stap kost 5 punten. Pas na de 1e gok.
create or replace function public.dn_hint(p_player uuid, p_secret uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d int := dn_today(); g dn_games;
begin
  perform dn_check(p_player, p_secret);
  select * into g from dn_games where player_id = p_player and day = d for update;
  if g is null or g.done or cardinality(g.guesses) < 1 or g.hints >= 2 then return dn_state(p_player); end if;
  update dn_games set hints = g.hints + 1, updated_at = now() where player_id = p_player and day = d;
  return dn_state(p_player);
end $$;

-- Opgeven ("kleine speler"): 0 punten en de reeks stopt
create or replace function public.dn_giveup(p_player uuid, p_secret uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d int := dn_today();
begin
  perform dn_check(p_player, p_secret);
  insert into dn_games(player_id, day) values (p_player, d) on conflict do nothing;
  update dn_games set done = true, won = false, gave_up = true, points = 0, updated_at = now()
   where player_id = p_player and day = d and not done;
  return dn_state(p_player);
end $$;

-- Wie was het gisteren? Het antwoord van gisteren plus jouw uitslag van gisteren.
create or replace function public.dn_yesterday(p_player uuid, p_secret uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d int := dn_today() - 1; a dn_stats; g dn_games;
begin
  perform dn_check(p_player, p_secret);
  if d < 0 then return null; end if;
  select * into a from dn_stats where code = dn_answer(d);
  if a.code is null then return null; end if;
  select * into g from dn_games where player_id = p_player and day = d;
  return jsonb_build_object('day', d, 'answer', dn_json(a),
    'played', coalesce(g.done, false), 'won', coalesce(g.won, false), 'gave_up', coalesce(g.gave_up, false),
    'n', cardinality(coalesce(g.guesses, '{}'::int[])), 'points', coalesce(g.points, 0));
end $$;

-- Poules
create or replace function public.dn_create_league(p_player uuid, p_secret uuid, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  perform dn_check(p_player, p_secret);
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 30 then raise exception 'Kies een poulenaam van 1 tot 30 tekens'; end if;
  if (select count(*) from dn_members where player_id = p_player) >= 20 then raise exception 'Je zit al in 20 poules'; end if;
  loop
    v_code := dn_code(6);
    exit when not exists (select 1 from dn_leagues l where l.code = v_code);
  end loop;
  insert into dn_leagues(code, name, created_by) values (v_code, trim(p_name), p_player);
  insert into dn_members(player_id, league_code) values (p_player, v_code);
  return v_code;
end $$;

create or replace function public.dn_join_league(p_player uuid, p_secret uuid, p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); v_name text;
begin
  perform dn_check(p_player, p_secret);
  select name into v_name from dn_leagues where code = v_code;
  if v_name is null then raise exception 'Deze poule bestaat niet'; end if;
  if (select count(*) from dn_members where player_id = p_player) >= 20 then raise exception 'Je zit al in 20 poules'; end if;
  insert into dn_members(player_id, league_code) values (p_player, v_code) on conflict do nothing;
  return v_name;
end $$;

create or replace function public.dn_league_name(p_code text) returns text
language sql stable security definer set search_path = public as $$
  select name from dn_leagues where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function public.dn_leave_league(p_player uuid, p_secret uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dn_check(p_player, p_secret);
  delete from dn_members where player_id = p_player and league_code = upper(p_code);
end $$;

-- Klassement van een poule (er is bewust geen openbare ranglijst). Telt alle spellen van de leden, ook van
-- vóór het lid worden. Uitslagen van anderen voor vandaag zie je pas als je zelf klaar bent.
-- Weekbekers: per afgelopen week (ma t/m zo) krijgt de hoogste weekscore in de poule een beker; gelijk = allebei.
drop function if exists public.dn_board(uuid, uuid, text);
create function public.dn_board(p_player uuid, p_secret uuid, p_scope text)
returns table (name text, tag text, is_me boolean, today_played boolean, today_n int, today_won boolean,
               today_gave_up boolean, today_points int, week_points int, last_week_points int, season_points int,
               streak int, cups int)
language plpgsql stable security definer set search_path = public as $$
declare d int := dn_today(); v_wk int := dn_week(dn_today()); v_done boolean; v_scope text := upper(coalesce(p_scope, ''));
begin
  perform dn_check(p_player, p_secret);
  if not exists (select 1 from dn_members where player_id = p_player and league_code = v_scope) then
    raise exception 'Je zit niet in deze poule';
  end if;
  select coalesce((select done from dn_games where player_id = p_player and day = d), false) into v_done;
  return query
    with grp as (
      select p.id, p.name, p.tag from dn_players p
      where exists (select 1 from dn_members m where m.player_id = p.id and m.league_code = v_scope)
    ),
    g as (
      select x.player_id, x.day, x.points, x.won, x.done, x.gave_up, cardinality(x.guesses) n
      from dn_games x join grp on grp.id = x.player_id where x.done and x.day <= d
    ),
    wk as (select player_id, dn_week(day) w, sum(points) pts from g group by 1, 2),
    best as (select w, max(pts) mx from wk where w < v_wk group by w),
    cup as (select wk.player_id, count(*)::int c from wk join best on best.w = wk.w and wk.pts = best.mx and best.mx > 0 group by 1)
    select grp.name, grp.tag, grp.id = p_player,
           t.player_id is not null,
           case when v_done or grp.id = p_player then t.n end::int,
           case when v_done or grp.id = p_player then t.won end,
           case when v_done or grp.id = p_player then t.gave_up end,
           case when v_done or grp.id = p_player then t.points end::int,
           coalesce((select sum(pts) from wk where wk.player_id = grp.id and wk.w = v_wk), 0)::int,
           coalesce((select sum(pts) from wk where wk.player_id = grp.id and wk.w = v_wk - 1), 0)::int,
           coalesce((select sum(points) from g where g.player_id = grp.id), 0)::int,
           dn_streak(grp.id),
           coalesce(cup.c, 0)
    from grp
    left join g t on t.player_id = grp.id and t.day = d
    left join cup on cup.player_id = grp.id;
end $$;

-- ---------- Beheer (alleen service_role: GitHub Action of SQL Editor) ----------
-- Plant antwoorden voor vandaag t/m vandaag + p_days. Kiest willekeurig uit de bekendste spelers
-- (hoogste eigendom, met punten), zonder herhaling binnen 180 dagen. Raakt bestaande dagen niet aan.
create or replace function public.dn_plan(p_days int default 60, p_pool int default 250) returns int
language plpgsql security definer set search_path = public as $$
declare d int; v_code int; v_added int := 0;
begin
  for d in greatest(dn_today(), 0) .. greatest(dn_today(), 0) + p_days loop
    continue when exists (select 1 from dn_answers where day = d);
    select s.code into v_code
      from (select code from dn_stats where pts > 0 order by own desc, pts desc limit p_pool) s
     where not exists (select 1 from dn_answers a where a.code = s.code and a.day between d - 180 and d + 180)
     order by random() limit 1;
    exit when v_code is null;
    insert into dn_answers(day, code) values (d, v_code);
    v_added := v_added + 1;
  end loop;
  return v_added;
end $$;

-- Laadt nieuwe spelersgegevens, vervangt toekomstige antwoorden van spelers die verdwenen zijn
-- en plant de komende 60 dagen vooruit.
create or replace function public.dn_admin_load(p_rows jsonb, p_meta jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_fixed int; v_planned int;
begin
  if p_rows is not null and jsonb_array_length(p_rows) > 0 then
    insert into dn_stats(code, web, team, pos, price, own, pts, gw, goals, assists, updated_at)
    select (e->>0)::int, e->>1, (e->>2)::int, (e->>3)::int, (e->>4)::int, (e->>5)::numeric, (e->>6)::int, (e->>7)::int,
           coalesce((e->>8)::int, 0), coalesce((e->>9)::int, 0), now()
    from jsonb_array_elements(p_rows) e
    on conflict (code) do update set web = excluded.web, team = excluded.team, pos = excluded.pos, price = excluded.price,
      own = excluded.own, pts = excluded.pts, gw = excluded.gw, goals = excluded.goals, assists = excluded.assists, updated_at = now();
    delete from dn_stats where code not in (select (e->>0)::int from jsonb_array_elements(p_rows) e)
      and code not in (select unnest(guesses) from dn_games)
      and code not in (select code from dn_answers where day <= dn_today());
  end if;
  if p_meta is not null then
    insert into dn_meta(key, value) select key, value from jsonb_each(p_meta)
    on conflict (key) do update set value = excluded.value;
  end if;
  delete from dn_answers a where a.day > dn_today() and not exists (select 1 from dn_stats s where s.code = a.code);
  get diagnostics v_fixed = row_count;
  v_planned := dn_plan(60);
  return 'stats=' || (select count(*) from dn_stats) || ' removed_future=' || v_fixed || ' planned=' || v_planned
         || ' days_ahead=' || coalesce((select max(day) from dn_answers) - dn_today(), -1);
end $$;

-- Lichte aanroep zodat een gratis Supabase-project niet wordt gepauzeerd
create or replace function public.dn_ping() returns int
language sql stable security definer set search_path = public as $$ select count(*)::int from dn_meta $$;

-- ---------- Rechten ----------
revoke all on function public.dn_today(), public.dn_week(int), public.dn_code(int), public.dn_check(uuid, uuid),
  public.dn_answer(int), public.dn_num(numeric, numeric, numeric), public.dn_cmp(public.dn_stats, public.dn_stats),
  public.dn_json(public.dn_stats), public.dn_initial(text), public.dn_streak(uuid), public.dn_best(uuid), public.dn_state(uuid),
  public.dn_plan(int, int), public.dn_admin_load(jsonb, jsonb), public.dn_ping()
  from public, anon, authenticated;

revoke all on function public.dn_create_player(text), public.dn_restore(text), public.dn_rename(uuid, uuid, text),
  public.dn_get(uuid, uuid), public.dn_guess(uuid, uuid, int), public.dn_hint(uuid, uuid), public.dn_giveup(uuid, uuid),
  public.dn_yesterday(uuid, uuid), public.dn_create_league(uuid, uuid, text), public.dn_join_league(uuid, uuid, text),
  public.dn_league_name(text), public.dn_leave_league(uuid, uuid, text), public.dn_board(uuid, uuid, text)
  from public;
grant execute on function public.dn_create_player(text), public.dn_restore(text), public.dn_rename(uuid, uuid, text),
  public.dn_get(uuid, uuid), public.dn_guess(uuid, uuid, int), public.dn_hint(uuid, uuid), public.dn_giveup(uuid, uuid),
  public.dn_yesterday(uuid, uuid), public.dn_create_league(uuid, uuid, text), public.dn_join_league(uuid, uuid, text),
  public.dn_league_name(text), public.dn_leave_league(uuid, uuid, text), public.dn_board(uuid, uuid, text)
  to anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.dn_admin_load(jsonb, jsonb), public.dn_plan(int, int), public.dn_ping() to service_role';
  end if;
end $$;
