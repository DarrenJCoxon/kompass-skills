# Kompass runner on Hetzner

The runner builds a project's current sequence unattended on the Hetzner box (`litebench-ci`), so it keeps going overnight with your Mac closed. It runs in its own container beside the CI runners, as a non-root user, with the Kompass skills and agents installed.

## One-time set-up (on the box)

1. Copy this repository to the box, or clone it from GitHub.
2. In `runner/`, copy `.env.example` to `.env` and fill in:
   - **`CLAUDE_CODE_OAUTH_TOKEN`**: run `claude setup-token` on your Mac and paste the token.
   - **`GH_TOKEN`**: a GitHub token that can push branches and open and merge pull requests.
3. Build the image: `docker compose build`.

These tokens are yours to create and paste in; no agent handles them.

## Running a sequence

```
docker compose run -d --name kompass-tertia runner DarrenJCoxon/tertia --hours 8
docker logs -f kompass-tertia
```

The runner fetches main, builds the current sequence one unit at a time (each in a fresh session on Opus), writes the sequence hand-over, and stops. You do the walkthrough, your feedback is recorded, and the next run starts the next sequence.

- **Stop after the current unit:** create `docs/kompass/STOP` on main.
- **Stop at once:** `docker stop kompass-tertia`. The unit in progress keeps its branch.

## Phone notifications

`notify.sh` follows a run's log and sends a notification through [ntfy](https://ntfy.sh) when a unit merges, parks or needs a look, and when the run ends or the sequence is handed over. Set `NOTIFY_URL` in `.env`, subscribe to that topic in the ntfy phone app, and start it beside each run:

```
nohup ./notify.sh kompass-tertia > notify.log 2>&1 < /dev/null &
```

It stops by itself when the run's container stops. Anyone who knows the topic can read it, so keep the name random; messages carry only unit ids and titles.

## Updating the skills

Pull the latest of this repository on the box and run `docker compose build` again.

## Session histories

Each unit session's history is kept on the `kompass-claude-state` volume, so what a session did before it stopped can be read afterwards. A volume created by an image before 26 Oct 2026 belongs to root and the runner refuses to start with it; fix it once with:

```
docker run --rm -u root --entrypoint chown -v kompass-claude-state:/v kompass-runner:local -R 1001:1001 /v
```
