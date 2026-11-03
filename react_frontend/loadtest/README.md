# Load test

`loadtest.mjs` plays a whole game with lots of simulated phones against the real
Supabase project (join, lobby, guessing, reveal, results) and prints latencies,
realtime errors and how many phones fell back to polling.

```bash
# needs a temporary admin account (games are admin-only) - create one, run, delete it
LT_ADMIN_EMAIL=... LT_ADMIN_PW=... node loadtest/loadtest.mjs --teams 40 --perTeam 3 --presence team --reveal rpc
```

Options: `--teams`, `--perTeam`, `--presence global|team`, `--reveal rpc|views`,
`--joinSecs`, `--guessSecs`, `--rounds`, `--stepGapMs`, `--poll 1|0`.

Things to know:
- It creates a game with code `LOAD`. Delete it (guesses -> teams -> locations -> games) when done.
- Run it in ONE foreground command. If the machine suspends the process between
  steps, the timings are garbage (subscribe times of minutes).
- Nothing should be running live while you test: it uses the project's real
  realtime/connection quota.
- Last results (free plan): 120 phones, reveal loaded in 1.9s (was 42s); 210 phones
  (past the 200-connection cap), 209 connected and the 1 left over kept up by polling.
