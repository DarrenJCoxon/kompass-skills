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

## Updating the skills

Pull the latest of this repository on the box and run `docker compose build` again.
