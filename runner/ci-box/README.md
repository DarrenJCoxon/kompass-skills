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
