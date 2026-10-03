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
| `VITE_ADMIN_PASSWORD` | unlocks the admin screens. No default: unset means admin stays locked |
| `VITE_STREETVIEW_STATIC` | optional, `1` = use the Street View Static API for picture thumbnails (must be enabled on the key) |

Anything starting with `VITE_` is baked into the built JavaScript, so none of
these are secret from someone who opens dev tools.

## How a game flows

1. Admin (gear icon -> password) sets options and **Create game**. A 4-letter code is made, and the
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

## Security notes (read before relying on this)

The app has no user accounts. Everything runs with the public anon key, and the admin
password only hides the admin *screens*. So anyone technical enough to call the database
directly could still, for example, read the answer coordinates, end a game, or squat on a game
code. The limits above stop junk and late/out-of-round guesses, not a determined cheater.
Real protection means moving admin actions behind server-side checks (database functions
that verify a secret, with direct writes switched off). Fine for a friendly bar night; worth
doing before anything with prizes.
