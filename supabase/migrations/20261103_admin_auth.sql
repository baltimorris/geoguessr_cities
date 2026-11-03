-- admin_auth: only signed-in admins can run a game.
--
-- Before this, every table was writable by anyone holding the public anon key
-- (which ships in the site's JS), and the admin "password" was a string in the
-- bundle. Now:
--   * admins sign in with a real Supabase Auth account (email + password)
--   * a row in public.admins says which accounts count as admins
--   * only an admin can create/update games or touch locations
--   * players can still read games, join teams, and guess - but they can only
--     read locations for rounds that have actually started
--
-- Run order matters: deploy the front end that has the admin sign-in form
-- FIRST, then apply this, or the old admin screen loses its write access.

-- ---- who is an admin -------------------------------------------------------
create table if not exists public.admins (
  email text primary key check (email = lower(email))
);
alter table public.admins enable row level security;     -- no policies: unreachable through the API
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth, pg_temp as $fn$
  select exists (
    select 1
    from auth.users u
    join public.admins a on a.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$fn$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---- games: anyone reads, only admins write ---------------------------------
drop policy if exists "anyone can create games" on public.games;
drop policy if exists "anyone can update games" on public.games;
create policy "admins create games" on public.games
  for insert to authenticated with check (public.is_admin());
create policy "admins update games" on public.games
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- locations: admins everything, players only rounds already in play -------
-- (stops anyone reading the answer key for later rounds straight from the API)
drop policy if exists "anyone can add locations" on public.locations;
drop policy if exists "anyone can update locations" on public.locations;
drop policy if exists "anyone can read locations" on public.locations;
create policy "admins manage locations" on public.locations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "players read rounds already in play" on public.locations
  for select to anon, authenticated using (
    exists (
      select 1 from public.games g
      where g.id = locations.game_id
        and g.status in ('active', 'finished')
        and locations.round <= g.current_round
    )
  );

-- ---- teams: players may only change a team's size and guessr seat ------------
revoke update on public.teams from anon, authenticated;
grant update (size, guessr_claimed) on public.teams to anon, authenticated;

create or replace function public.guard_team_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  -- the handicap leans on team size, so once a game is running it can only grow
  if new.size < old.size and exists (select 1 from public.games g where g.id = new.game_id and g.status <> 'lobby') then
    raise exception 'team rejected: size can only go up once the game has started';
  end if;
  return new;
end $fn$;
drop trigger if exists guard_team_update on public.teams;
create trigger guard_team_update before update on public.teams
  for each row execute function public.guard_team_update();

-- the insert guards now run with their own rights, so they keep working
-- whatever the caller is allowed to read
alter function public.guard_guess_insert() security definer;
alter function public.guard_team_insert() security definer;
