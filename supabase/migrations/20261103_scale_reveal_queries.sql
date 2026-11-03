-- scale_reveal_queries: make the reveal / results screens cheap when a whole
-- room asks at once.
--
-- The guess_scores view ranks EVERY guess ever made (window over the whole
-- guesses table) and only then filters to the game being asked about, so each
-- call cost grows with the history of all games, and a reveal made every phone
-- run it 3 times at the same instant. With 120 test phones that was ~42s.
--
-- game_guess_scores(game) does the same math but only ever touches that one
-- game's guesses. reveal_data / results_data bundle what each screen needs into
-- ONE call. The views stay as they are for reviewing scores by hand.

create index if not exists guesses_team_round_loc_idx
  on public.guesses (team_id, round, location, created_at desc);

-- The score math is written out inline here instead of calling haversine_ft /
-- score_guess / size_handicap / score_with_handicap. Those carry a pinned
-- search_path (a security-advisor fix), which stops Postgres inlining them and
-- adds overhead to every call - roughly 8 calls per guess, ~0.13ms each guess,
-- which adds up when a whole room asks at once. Same formulas, same results
-- (checked against the views row for row), no per-row function calls.
-- p_only_latest drops superseded guesses before scoring; p_max_round skips
-- rounds nobody asked about.
drop function if exists public.game_guess_scores(uuid);
create or replace function public.game_guess_scores(
  p_game uuid, p_only_latest boolean default false, p_max_round integer default null)
returns setof public.guess_scores
language sql stable set search_path = public, pg_temp as $fn$
  with ranked as (
    select g.id as guess_id, g.team_id, g.round, g.location as seq, g.lat, g.lng, g.created_at,
           row_number() over (partition by g.team_id, g.round, g.location order by g.created_at desc) as rn
    from public.guesses g
    where g.team_id in (select t0.id from public.teams t0 where t0.game_id = p_game)
      and (p_max_round is null or g.round <= p_max_round)
  )
  select r.guess_id,
         t.id,
         t.game_id,
         t.name,
         t.emoji,
         c.sz,
         r.round,
         r.seq,
         r.lat,
         r.lng,
         l.lat,
         l.lng,
         h.d,
         case when c.hc
           then round(b.base * greatest(0.5, 1 - 0.04 * greatest(0, coalesce(c.sz, 1) - 2)))::integer
           else b.base
         end,
         r.created_at,
         (r.rn = 1)
  from ranked r
  join public.teams t on t.id = r.team_id
  join public.games ga on ga.id = t.game_id
  join public.locations l on l.game_id = t.game_id and l.round = r.round and l.seq = r.seq
  cross join lateral (select
      least(t.size, coalesce((ga.settings ->> 'maxTeamSize')::integer, 2147483647)) as sz,
      coalesce((ga.settings ->> 'maxPoints')::integer, 5000) as mp,
      case when ga.city = 'NYC' then 130000.0 else 73000.0 end as md,
      coalesce((ga.settings ->> 'handicap')::boolean, true) as hc) c
  cross join lateral (select
      2 * 6378137 * asin(sqrt(
        power(sin(radians(r.lat - l.lat) / 2), 2) +
        cos(radians(l.lat)) * cos(radians(r.lat)) * power(sin(radians(r.lng - l.lng) / 2), 2)
      )) * 3.28084 as d) h
  cross join lateral (select
      round(case
        when h.d < 160 then c.mp::double precision
        else least(c.mp::double precision, c.mp * exp(-10 * h.d / c.md) * (case when h.d < 5280 then 1.02 else 1 end))
      end)::integer as base) b
  where (not p_only_latest or r.rn = 1);
$fn$;

-- everything the round reveal needs, in one round trip
create or replace function public.reveal_data(p_game uuid, p_round integer)
returns jsonb
language sql stable set search_path = public, pg_temp as $fn$
  with s as (
    select * from public.game_guess_scores(p_game, true, p_round)
  )
  select jsonb_build_object(
    'teams', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'size', t.size))
                       from public.teams t where t.game_id = p_game), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
                  'team_name', s.team_name, 'team_emoji', s.team_emoji, 'scored_team_size', s.scored_team_size,
                  'round', s.round, 'location_seq', s.location_seq, 'guess_lat', s.guess_lat,
                  'guess_lng', s.guess_lng, 'distance_ft', s.distance_ft, 'points', s.points))
                from s), '[]'::jsonb),
    'round_rows', coalesce((select jsonb_agg(jsonb_build_object(
                  'team_name', rr.team_name, 'round', rr.round,
                  'round_points', rr.round_points, 'running_total', rr.running_total))
                from (
                  select s.team_name, s.round, sum(s.points) as round_points,
                         sum(sum(s.points)) over (partition by s.team_id order by s.round
                                                  rows between unbounded preceding and current row) as running_total
                  from s where s.round >= 1
                  group by s.team_id, s.team_name, s.round
                ) rr), '[]'::jsonb)
  );
$fn$;

-- everything the final scores screen needs: each team, its total, the size it was scored at
create or replace function public.results_data(p_game uuid)
returns jsonb
language sql stable set search_path = public, pg_temp as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', t.name,
           'size', coalesce(tt.scored_size, t.size, 1),
           'total', coalesce(tt.total, 0))
         order by coalesce(tt.total, 0) desc), '[]'::jsonb)
  from public.teams t
  left join (
    select s.team_id, sum(s.points) as total, max(s.scored_team_size) as scored_size
    from public.game_guess_scores(p_game, true) s
    where s.round >= 1
    group by s.team_id
  ) tt on tt.team_id = t.id
  where t.game_id = p_game;
$fn$;
