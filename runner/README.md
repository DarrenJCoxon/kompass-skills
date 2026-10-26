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

## Phone notifications

When `NOTIFY_URL` is set, `start.sh` also starts `notify.sh`, which follows the run's log and sends a notification through [ntfy](https://ntfy.sh) when a unit merges, parks or needs a look, and when the run ends or the sequence is handed over. Subscribe to the topic in the ntfy phone app. It stops by itself when the run's container stops. Anyone who knows the topic can read it, so keep the name random; messages carry only unit ids and titles.

## Updating the skills

`~/kompass-skills` on the server is a clone of GitHub's main. Update it only with `~/kompass-skills/runner/update.sh`: it fast-forwards to main and rebuilds the image, and refuses if the copy has local changes, so nothing edited on the server is lost silently. Change the skills or the runner through a pull request, never by editing the server's copy.

## Session histories

Each unit session's history is kept on the `kompass-claude-state` volume, so what a session did before it stopped can be read afterwards. A volume created by an image before 26 Oct 2026 belongs to root and the runner refuses to start with it; fix it once with:

```
docker run --rm -u root --entrypoint chown -v kompass-claude-state:/v kompass-runner:local -R 1001:1001 /v
```
