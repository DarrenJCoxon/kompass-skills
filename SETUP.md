# Setting up Kompass Skills (instructions for the AI agent)

The operator has given you this repository's link and wants to use Kompass Skills in their project, new or already under way. Walk them through the set-up below, in order. Assume no prior knowledge.

Every part starts by checking what already exists, and skips what is already done. A second project on the same runner takes about ten minutes.

How to guide them:
- One step at a time. Say what the step is for in one sentence, give exact clicks or one command, then wait for them to say it's done before moving on.
- Do everything you can yourself (commands, checks, files). Ask the operator only for what needs them: accounts, payments, approvals and secrets.
- Secrets are theirs. Never ask them to paste a token into the chat, never print one, and never type one for them. They paste tokens into a file themselves; you check the file without showing what's in it.
- Ask before you change anything on GitHub or anything that costs money.
- If a step fails, say plainly what failed and what you'll try next.

## Part 1: install the skills (about 5 minutes)

1. Check that you are Claude Code, in the operator's project folder, and that the project is a git repository on GitHub with `gh` signed in (`gh auth status`). If any of these is missing, help them fix it first.
2. Find out what the project already has, and tell the operator in plain words, before changing anything:
   - **Kompass already:** there is a `docs/kompass/plan.md`. Note whether it records an approval and a `runner:`.
   - **LiteBench:** there is a `litebench.json` or a `docs/litebench/` folder. It may also have locked checks (for example `docs/litebench/protected-checks.json` and guard tests) and a CI workflow named after LiteBench.
   - **Other plans:** a roadmap, a backlog, specs, design files, ticket exports or a planning doc in the repo, or one the operator points you to.
   - **Nothing:** a new project.
   - **Its toolchain:** for example Node with pnpm, or Python. Note how CI runs its checks, and the name of its required check.
3. If `kompass-plan` is already available in this session, the plugin is installed: skip to step 5.
4. Install the plugin. Run `claude plugin marketplace add DarrenJCoxon/kompass-skills`, then `claude plugin install kompass@kompass`. If those commands aren't available, ask the operator to type `/plugin marketplace add DarrenJCoxon/kompass-skills` and then `/plugin install kompass@kompass` in Claude Code.
   Then ask them to restart Claude Code in the project, so the five skills load. They should then see `kompass-plan`, `kompass-units`, `kompass-build`, `kompass-run` and `kompass-find`.
5. Check the repository's safety settings with `gh api` and explain each one in a sentence. All three are needed before any unit merges by itself:
   - main accepts changes only through pull requests, with one required CI check;
   - a pull request must be up to date with main before it merges;
   - auto-merge is allowed;
   - "Do not allow bypassing the above settings" is on, so the agents' token (often an admin's) can't skip the required check by merging directly.

   If the project already has CI, keep its required check as it is, LiteBench's included; never rename or remove a required check during set-up. If it has no CI yet, offer to add a workflow that runs its type-check, lint and tests as one check. Show the exact settings change and make it only after they say yes.

## Part 2: the runner

First check whether they already have one. Run `ssh -o BatchMode=yes -o ConnectTimeout=10 kompass-runner 'ls ~/kompass-skills/runner/start.sh'`.

- **It works:** they have a runner. Tell them, and do Part 3J (join this project to it, about 5 minutes).
- **It fails:** ask "Do you already have a server running Kompass for another project?"
  - **Yes:** ask for its address. Add the `kompass-runner` entry from 3.2 step 1 for it (with the user they log in as), check it works, then do Part 3J.
  - **No:** ask "Do you want building to carry on while your laptop is closed? It needs a small rented server, a few pounds or euros a month, and about 30 minutes to set up. You can skip this and add it later." If they say yes, do Part 3. If they say no, go to Part 4.

## Part 3J: join this project to an existing runner (about 5 minutes)

1. **The GitHub token.** The runner's token must also cover this repository. Ask them to:
   1. open https://github.com/settings/personal-access-tokens;
   2. click the runner's token (usually `kompass-runner`), then **Edit**;
   3. under **Repository access**, add this repository;
   4. click **Update**.

   The token itself doesn't change, so nothing needs pasting. If the token has expired, they make a new one as in 3.3 step 2, covering every repository the runner builds, and paste it as in 3.3 step 3.
2. **The toolchain.** Check that `~/kompass-skills/runner/Dockerfile` on the server covers this project's toolchain, as Part 1 found it. If it doesn't, add what is missing through a pull request to kompass-skills (or a fork), then run `~/kompass-skills/runner/update.sh`. A rebuild doesn't disturb a run already going for another project.
3. **Check it can reach the repository.** Run `ssh kompass-runner 'cd ~/kompass-skills/runner && docker compose run --rm --entrypoint gh runner repo view <owner/repo> --json name'`. It should print `{"name":"<repo>"}`. Anything else means the token doesn't cover it yet: go back to step 1.
4. **Record the runner** as in 3.5, and confirm that phone notifications already work (3.4). The same ntfy topic serves every project, and each message starts with the project's name.

Then go to Part 4.

## Part 3: set up the runner on a server (about 30 minutes)

### 3.1 Rent the server

1. Ask them to open https://console.hetzner.cloud, create an account (it may ask for ID and a payment card), then create a project.
2. Make sure they have an SSH key. If `~/.ssh/id_ed25519.pub` is missing, create one with `ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519`. Copy the public key for them with `pbcopy < ~/.ssh/id_ed25519.pub` on a Mac, or show the file's one line.
3. Walk them through **Add Server**:
   - **Location:** the nearest.
   - **Image:** Ubuntu (the newest LTS).
   - **Type:** shared CPU with at least 8 GB of memory, because builds run the project's tests. That's enough for one project at a time. Tests run about twice as slowly as on an Apple-silicon laptop, so suggest a dedicated server later (Hetzner's dedicated-CPU cloud servers, or a dedicated AX machine) if several projects build at once or browser tests take most of the time.
   - **SSH keys:** Add SSH key, then paste.
   - **Name:** `kompass-runner`.

   Then they click **Create & Buy now**.
4. Ask them for the server's IPv4 address (shown on the server's page). It is not a secret.

### 3.2 Prepare the server (you do this)

1. Add a short name for the server to `~/.ssh/config`, so no address is ever written into the repository:
   ```
   Host kompass-runner
     HostName <IPv4>
     User ops
     IdentityFile ~/.ssh/id_ed25519
   ```
2. Over `ssh root@<IPv4>`:
   - install Docker (`apt-get update && apt-get install -y docker.io docker-compose-v2 git`);
   - create the user `ops` in the `docker` group, with the same `authorized_keys`;
   - check that `ssh kompass-runner docker ps` works;
   - then lock it down, since it will hold two tokens: in `/etc/ssh/sshd_config` set `PasswordAuthentication no` and `PermitRootLogin no`, restart SSH, and allow only SSH in through the firewall (`ufw allow OpenSSH && ufw --force enable`). Check `ssh kompass-runner` still works before you close the root session.
3. As `ops`, clone this repository (`git clone https://github.com/DarrenJCoxon/kompass-skills.git ~/kompass-skills`). Keep it a clone: it is updated only with `runner/update.sh`, never edited in place.
4. In `~/kompass-skills/runner`, copy `.env.example` to `.env` and run `chmod 600 .env`. Fill in `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL` from the operator's local `git config`. Add `NOTIFY_URL=https://ntfy.sh/kompass-<random>`, using `openssl rand -hex 10` for the random part.
5. Build the image with `docker compose build`. It takes a few minutes. The image suits Node projects. Another toolchain goes into `runner/Dockerfile` through a pull request to kompass-skills (or the operator's fork of it), then `runner/update.sh`; never edit the server's copy in place. Browser tests need nothing extra: the first session installs Playwright's browser (`pnpm exec playwright install chromium`) and it's kept on the `kompass-browsers` volume across restarts.

### 3.3 The two tokens (the operator does this)

1. **Claude.** They run `claude setup-token` in Terminal on their own computer and sign in. It needs a Claude Pro or Max plan. It prints a long token starting `sk-ant-oat`. Tell them to copy it all, and to watch out: Terminal may wrap it across two lines.
2. **GitHub.** They open https://github.com/settings/personal-access-tokens/new and fill it in like this:
   - **Name:** `kompass-runner`.
   - **Expiration:** 90 days.
   - **Repository access:** Only select repositories, then this project.
   - **Repository permissions:** Contents, Pull requests and Workflows set to Read and write; Actions and Commit statuses set to Read-only.

   They click **Generate token** and copy it. It starts `github_pat_`, and GitHub shows it only once.
3. **Pasting them in.** Ask them to run this in Terminal: `ssh -t kompass-runner nano kompass-skills/runner/.env`. Then tell them, exactly:
   - put the cursor just after `CLAUDE_CODE_OAUTH_TOKEN=` and paste with Cmd+V (Ctrl+Shift+V on Linux);
   - do the same after `GH_TOKEN=`;
   - save by holding **Control** and pressing **O**, then pressing **Return**;
   - exit by holding **Control** and pressing **X**.
4. Check the file without showing it. Print only each line's name, its length and its first eight characters. Expect `sk-ant-o…`, about 108 characters, and `github_p…`, about 93. A token split over two lines shows as an extra line with no name: join it back with a short script, without displaying it.
5. Check both tokens work from inside the runner, before any real run:
   - Claude: `ssh kompass-runner 'cd ~/kompass-skills/runner && docker compose run --rm -T --entrypoint claude runner -p "Reply with OK" --model haiku'` prints OK;
   - GitHub: `ssh kompass-runner 'cd ~/kompass-skills/runner && docker compose run --rm -T --entrypoint gh runner repo view <owner/repo> --json name'` prints the repository's name.
   If either fails, fix that token now rather than finding out on the first run.

### 3.4 Phone notifications

1. Ask them to install the free **ntfy** app and subscribe to the topic after `https://ntfy.sh/` in `NOTIFY_URL`. Tell them the topic name; anyone who has it can read the messages.
2. Send a test message with `curl -d "Kompass runner connected" <NOTIFY_URL>` and check that it reached them.

### 3.5 Record the runner

Set `runner: kompass-runner` in the project's `docs/kompass/plan.md` once that file exists (kompass-plan creates it). `kompass-run` starts runs with `ssh kompass-runner '~/kompass-skills/runner/start.sh <owner/repo> --hours 8'`.

### 3.6 Steer from the phone with the laptop shut (optional, about 5 minutes)

This adds an always-on Claude session on the server, called "Kompass monitor". The operator opens it from the Claude app's Code tab and tells it what to do. It needs a Claude Pro, Max, Team or Enterprise plan; on Team and Enterprise, an owner must first turn on Remote Control.

You do:
1. Install Claude Code and the GitHub CLI for `ops`. Claude Code: `curl -fsSL https://claude.ai/install.sh | bash`. The GitHub CLI: from its apt repository, as in `runner/Dockerfile`.
2. Add the boot line `@reboot $HOME/kompass-skills/runner/monitor.sh >> $HOME/kompass-monitor.log 2>&1` to `ops`'s crontab.

The operator does, at their computer, since you never type their login code:
1. `ssh -t kompass-runner` to log in to the server.
2. `claude auth login`. Choose the Claude account option, open the link it shows, sign in, and paste the code back into Terminal. The runner's token can't open Remote Control sessions, so this login is needed.
3. `~/kompass-skills/runner/monitor.sh`, then `tmux attach -t kompass-monitor`.
4. Answer **y** to "Enable Remote Control?", and trust the folder if asked.
5. To leave it running, hold **Control** and press **B**, let go, then press **D**. Then type `exit`.

Then check that "Kompass monitor" shows in the Claude app's Code tab. It restarts by itself if it stops, and after a reboot.

## Part 4: plan, or bring the existing plans across

What comes next depends on what Part 1 found.

**Kompass already, with an approved plan:** nothing to convert. Make sure `plan.md` names the runner (3.5) and offer `/kompass-run` for the current sequence.

**LiteBench or other plans:** this is a carry-over, not a new plan. `kompass-plan` does it with the operator, item by item: it shows everything that exists, asks what to keep, update, merge, split or drop, and carries approved work across unchanged with its approvals quoted. Then `kompass-units` turns the kept items into units. Before starting, tell the operator four things:
1. Nothing they approved is re-planned without their say.
2. LiteBench's records stay in `docs/litebench/` as read-only history; new work is recorded in `docs/kompass/`.
3. LiteBench's locked checks, guard tests and CI stay in force. Changing or retiring them is its own item in the plan, made only with the operator's yes, recorded the way the project records approvals.
4. Units continue LiteBench's numbering, so old and new ids never clash.

**Nothing yet:** a new plan. Tell them what happens next, in three lines:
1. Plan with you (`/kompass-plan`): the brief, the module map and mockups for the key screens, ending in one approval.
2. Break the plan into units (`/kompass-units`).
3. Build: one unit with `/kompass-build`, or a whole sequence with `/kompass-run`, which uses the runner when there is one.

Then offer to start `/kompass-plan` now.
