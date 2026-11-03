# LocalGuessr (web app)

A GeoGuessr-style bar game for a city (DC or NYC). Teams of two roles play
together on their phones: the **Viewr** sees a Street View of a spot, the
**Guessr** sees only a map and drops a pin where they think it is. Closer pins
score more. An admin runs the game from their own phone and walks the room
through the reveal (and can put it on a projector).

Built with React + Vite, Supabase (Postgres + realtime), Leaflet maps, the
Google Maps JavaScript API for Street View, and framer-motion for animation.

## Running it

```bash
cd react_frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

Create `react_frontend/.env.local` (never commit it):

| variable | what it is |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | the Supabase project (the anon key is public by design) |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps JavaScript API key, restrict it by HTTP referrer |
| `VITE_STREETVIEW_STATIC` | optional, `1` = use the Street View Static API for picture thumbnails (must be enabled on the key) |

Anything starting with `VITE_` is baked into the built JavaScript, so none of
these are secret from someone who opens dev tools - which is fine, because none
of them is a secret (the Supabase anon key and a referrer-restricted Maps key
are meant to be public). There is no admin password in the site's code.

## How a game flows

1. Admin (gear icon -> sign in with an admin account) sets options and **Create game**. A 4-letter code is made, and the
   practice-round spots are added.
2. **Generate locations** picks the real rounds' spots. **Review locations** shows them on a map with
   pictures; bad ones can be swapped.
3. Players open the site, **Play now!**, enter the code, pick a team name/emoji and a role, and wait in the lobby.
4. Admin taps **Start game**: round 0 (practice, doesn't count) runs first, then rounds 1-3.
5. Each round is a countdown. When it ends, the admin steps through the reveal one tap at a time.
6. After the last round: final podium, then **Finish game**.

## Code map (`src/`)

- `App.jsx` - state + screen switching + all admin actions
- `components/` - one file per screen/piece (each file's top comment says what it is)
- `scoring.js` - presentation helpers (the score math is in the database)
- `generateLocations.js`, `locationQC.js`, `practiceLocations.js`, `data/regions.json` - how spots are chosen, checked, and the fixed practice spots
- `supabase.js` - the database client
- `App.css`, `index.css`, `components/*.css` - styling

## Database (Supabase)

Tables: `games`, `teams`, `guesses`, `locations`. Scoring is computed in SQL, so it
can be reviewed without the app:

- functions `haversine_ft`, `score_guess`, `size_handicap`, `max_dist_for_city`, `score_with_handicap`
- views `guess_scores` (every guess, scored; `is_latest` = the one that counts),
  `team_round_scores`, `team_total_scores`, `team_leaderboard`. Round 0 (practice) is scored in
  `guess_scores` but excluded from the round/total/leaderboard views.

Guards in the database: size/range limits on every table, a trigger that only accepts a
guess for the live round before its timer (plus 45s) runs out, and a cap on teams per game.

## Admin accounts

Admins sign in with a real Supabase Auth account (email + password). The database
decides who counts: an email listed in `public.admins` (and confirmed in Supabase Auth)
passes `is_admin()`, and row-level security lets only those accounts create/update games
or read/write locations. Players only ever read games, create their team, update their
own team's size/seat, insert guesses (guarded by a trigger), and read locations for
rounds that have already started. See `supabase/migrations/20261103_admin_auth.sql`.

To add or remove a co-host: create/delete their user in Supabase -> Authentication -> Users,
then `insert into public.admins values ('their@email');` (lowercase) or delete the row.
Keep "Allow new users to sign up" switched **off** in Authentication settings.

## Security notes

- Still true: guesses and teams are readable by anyone with the public key, so a technical
  player could read other teams' guesses mid-round, and a viewr's phone necessarily has the
  current round's coordinates (that's the game) - which a teammate can see too.
- Handicap manipulation is limited (team size can only grow once a game starts) but the
  size is reported by the players' phones.
- There is no rate limiting beyond Supabase's own.
