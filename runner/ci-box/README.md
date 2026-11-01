# CI box

The self-hosted GitHub Actions runners on the Kompass server: one private Docker engine (`lb-dind`) shared by one runner per repository (two for Tertia: `box-tertia` and `box-layerware`, the repository's old name). Workflows pick them with `runs-on: ['self-hosted', 'litebench']`. Until 27 Oct 2026 these files lived only on the server, in `/opt/litebench-runners`; they are changed here, through pull requests, like the rest of the runner.

| File | What it does |
|---|---|
| `compose.yaml` | The shared engine (profile `base`) and the runner service (profile `runner`), with the CI slot settings |
| `Dockerfile` | GitHub's runner image plus Node 20/22/24, Corepack, Docker Compose and psql; the hooks are baked in |
| `entrypoint.sh` | Registers once (kept in the runner's state volume), then runs jobs with the hooks |
| `hooks/slots.sh` | The CI slots: how many jobs run at once, and which take every slot |
| `hooks/job-started.sh`, `hooks/job-completed.sh` | Take and heartbeat a job's slots, then release them |
| `hooks/disk-guard.sh` | Keeps the shared disk from filling; clears shared files only while no other job runs |
| `register.sh` | Starts a new repository's runner from a registration token piped in |
| `rebuild.sh` | Rebuilds the image and recreates each runner once it is idle, never killing a job |

## CI slots

`CI_SLOTS` jobs run at once: 2 by default, for the server as it is (8 vCPU, 15 GB). The resize to 16 vCPU was decided against on 28 Oct 2026 (Hetzner's June 2026 prices and order limits); raise it to 3 only after a resize. A job of a repository in `CI_SHARED_REPOS` (Tertia) takes any free slot. Any other repository's job takes every slot, as every job did before: all runners share one network namespace, so two jobs that publish the same port (sen-insights' qa-gate publishes 5432 and 3000) would collide. Add a repository to `CI_SHARED_REPOS` only once its CI publishes no ports. Both settings are in `compose.yaml`.

A slot not refreshed for 5 minutes belongs to a job that died and is taken over. While any slot is held, the hooks also hold the old box-wide lock (`/locks/job`), so a runner still on an image from before the slots waits instead of running beside them; that lets `rebuild.sh` roll a change out runner by runner. The disk guard clears shared files only after taking the box to itself. Tests: `bash runner/ci-box/hooks/slots.test.sh`.

## Changing the CI box

Merge the change to main, then on the server:

```
~/kompass-skills/runner/update.sh                 # fast-forward the server's copy
~/kompass-skills/runner/ci-box/rebuild.sh         # rebuild, recreating each runner once idle
```

`rebuild.sh` waits up to 30 minutes for each busy runner and skips (never kills) one still busy; run it again later for those.

## CI runners on boat

Extra CI runners can run on [boat](https://boat.dev) machines beside this box (on trial for Tertia since 29 Oct 2026; see the README). They take the same jobs, because they carry the same labels.

1. **The operator** creates a boat account and an API key, and saves the key on the server without showing it: `read -s -p "Paste boat key: " K && echo "BOAT_API_KEY=$K" >> ~/kompass-skills/runner/.env && unset K`. Then, in GitHub (the repository's Settings, Actions, Runners, New self-hosted runner), they copy the code after `--token` and save it the same way as `GH_RUNNER_TOKEN`. The token lasts one hour.
2. **Install the CLI only** (the installer also edits shell start-up files): `curl -fsSL "https://boat.dev/api/boat/cli/download?platform=linux-x64&channel=prod" -o ~/.ascii/bin/boat`, then sign in with `grep '^BOAT_API_KEY=' runner/.env | cut -d= -f2- | boat login --key-stdin`. Set `BOAT_NO_UPDATE=1`.
3. **Start a machine:** `boat new --type default --name <repo>-ci-1` (`--no-auto-stop` on a paid plan; the free trial caps auto-stop at 2 hours, so `boat extend <id> --hours 2` it hourly).
4. **Register the runner on it.** Copy the token to the machine as a file (`boat scp`), never on a command line, then install fnm (CI uses it) and the Actions runner, and run `./config.sh --unattended --url https://github.com/<owner>/<repo> --token "$(cat ~/gh-runner-token)" --name boat-ci-1 --labels self-hosted,litebench,boat`, delete the token file, and start `./run.sh` in the background. Remove `GH_RUNNER_TOKEN` from `.env` once used.
5. **Stopping:** `boat stop <id>` snapshots the machine and stops billing; it keeps its runner registration, so `boat` starting it again brings the runner back without a new token. To retire one, remove the runner in GitHub and `boat delete <id> --yes`.

Boat machines don't take this box's CI slots or hooks: each runs one job at a time on its own CPUs. Never put real school data on one.
