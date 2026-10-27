# Kompass runner

The runner builds a project's current sequence unattended on a small server (we use Hetzner), so it keeps going overnight with your laptop closed. It runs in its own container, as a non-root user, with the Kompass skills and agents installed.

## One-time set-up

Follow Part 3 of [`SETUP.md`](../SETUP.md), or give your coding agent this repository's link and it will walk you through it. In short:

1. Rent a server with Docker, reachable as `ssh kompass-runner`, and clone this repository to `~/kompass-skills` on it.
2. In `runner/`, copy `.env.example` to `.env` (`chmod 600`) and fill it in:
   - **`CLAUDE_CODE_OAUTH_TOKEN`**: run `claude setup-token` on your own computer and paste the token.
   - **`GH_TOKEN`**: a fine-grained GitHub token for the repositories the runner builds.
   - **`NOTIFY_URL`** (optional): an ntfy topic for phone notifications.
3. Build the image: `docker compose build`.

The tokens are yours to create and paste in; no agent handles them.

## Running a sequence

```
~/kompass-skills/runner/start.sh <owner/repo> --hours 8 [--parallel 2]
docker logs -f kompass-<repo>
```

The runner fetches main, builds the current sequence one unit at a time (each in a fresh session on Opus), writes the sequence hand-over, and stops. You do the walkthrough, your feedback is recorded, and the next run starts the next sequence.

- **Stop after the current unit:** create `docs/kompass/STOP` on main.
- **Stop at once:** `docker stop kompass-<repo>`. The unit in progress keeps its branch.

## Building alongside the runner

You can build units in your own Claude sessions while the runner works; the tooling keeps the two apart, so nobody has to pass messages between them.

- **Every unit is visible from its first minute.** `kompass-build` pushes the unit's branch as soon as it marks the unit `building`, and again whenever its records change. `scripts/in-flight.mjs` lists every unit in flight, from the `kompass/*` branches and open pull requests: its id, branch, status, `owns`, the files it has changed so far and the record numbers it has taken.
- **The unit that started first lands first.** At the start of a build, and again in `merge-when-green.sh`, a unit is compared with every other unit in flight. If they share files, the one that started later waits for the earlier one to land (`in-flight.mjs --wait`), merges main, runs its checks again and only then lands. The wait goes in its log. `merge-when-green.sh` exits 6 rather than land it first.
- **One number allocator.** `scripts/next-id.mjs` gives the next free `D-` and `WU-` number across main, every unit branch, every open pull request and every local copy, so the runner and your sessions never take the same number.
- **Session start says what is in flight.** The plugin's session-start check lists the units in flight on other branches and the files they hold.

A unit with no push for 24 hours and no pull request, or only its draft `building` one, is listed as stale and holds nothing back, so a session that died can't hold files for ever. A unit's kept branch is in flight only while the unit is being worked on (an open pull request, or `building` again on that branch): with neither, a unit that main shows as parked, waiting, dropped or delivered is listed as resting and holds nothing back, so a parked unit's kept branch can't block later units.

## Phone notifications

When `NOTIFY_URL` is set, `start.sh` also starts `notify.sh`, which follows the run's log and sends a notification through [ntfy](https://ntfy.sh) when a unit merges, parks or needs a look, and when the run ends or the sequence is handed over. Subscribe to the topic in the ntfy phone app. It stops by itself when the run's container stops. Anyone who knows the topic can read it, so keep the name random; messages carry only unit ids and titles.

## Updating the skills

`~/kompass-skills` on the server is a clone of GitHub's main. Update it only with `~/kompass-skills/runner/update.sh`: it fast-forwards to main and rebuilds the image, and refuses if the copy has local changes, so nothing edited on the server is lost silently. Change the skills or the runner through a pull request, never by editing the server's copy.

```
ssh kompass-runner '~/kompass-skills/runner/update.sh'
```

A run already going keeps its image (and the scripts and skills baked into it) until it ends; the next run uses the new one. Update the plugin on your own computer at the same time (`claude plugin marketplace update kompass`, then restart Claude Code), so your sessions and the runner follow the same rules.

## Session histories

Each unit session's history is kept on the `kompass-claude-state` volume, so what a session did before it stopped can be read afterwards. A volume created by an image before 26 Oct 2026 belongs to root and the runner refuses to start with it; fix it once with:

```
docker run --rm -u root --entrypoint chown -v kompass-claude-state:/v kompass-runner:local -R 1001:1001 /v
```
