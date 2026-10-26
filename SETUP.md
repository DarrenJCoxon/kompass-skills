# Setting up Kompass Skills (instructions for the AI agent)

The operator has given you this repository's link and wants to use Kompass Skills. Walk them through the set-up below, in order. Assume no prior knowledge.

How to guide them:
- One step at a time. Say what the step is for in one sentence, give exact clicks or one command, then wait for them to say it's done before moving on.
- Do everything you can yourself (commands, checks, files). Ask the operator only for what needs them: accounts, payments, approvals and secrets.
- Secrets are theirs. Never ask them to paste a token into the chat, never print one, and never type one for them. They paste tokens into a file themselves; you check the file without showing what's in it.
- Ask before you change anything on GitHub or anything that costs money.
- If a step fails, say plainly what failed and what you'll try next.

## Part 1: install the skills (about 5 minutes)

1. Check that you are Claude Code, in the operator's project folder, and that the project is a git repository on GitHub with `gh` signed in (`gh auth status`). If any of these is missing, help them fix it first.
2. Install the plugin. Run `claude plugin marketplace add DarrenJCoxon/kompass-skills`, then `claude plugin install kompass@kompass`. If those commands aren't available, ask the operator to type `/plugin marketplace add DarrenJCoxon/kompass-skills` and then `/plugin install kompass@kompass` in Claude Code.
3. Ask them to restart Claude Code in the project, so the five skills load. They should then see `kompass-plan`, `kompass-units`, `kompass-build`, `kompass-run` and `kompass-find`.
4. Check the repository's safety settings with `gh api` and explain each one in a sentence. All three are needed before any unit merges by itself:
   - main accepts changes only through pull requests, with one required CI check;
   - a pull request must be up to date with main before it merges;
   - auto-merge is allowed.

   If the project has no CI yet, offer to add a workflow that runs its type-check, lint and tests as one check. Show them the exact settings change and make it only after they say yes.

## Part 2: ask about the runner

Ask: "Do you want building to carry on while your laptop is closed? It needs a small rented server, a few pounds or euros a month, and about 30 minutes to set up. You can skip this and add it later."

- If they say no, go to Part 4.
- If they say yes, do Part 3.

## Part 3: set up the runner on a server (about 30 minutes)

### 3.1 Rent the server

1. Ask them to open https://console.hetzner.cloud, create an account (it may ask for ID and a payment card), then create a project.
2. Make sure they have an SSH key. If `~/.ssh/id_ed25519.pub` is missing, create one with `ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519`. Copy the public key for them with `pbcopy < ~/.ssh/id_ed25519.pub` on a Mac, or show the file's one line.
3. Walk them through **Add Server**:
   - **Location:** the nearest.
   - **Image:** Ubuntu (the newest LTS).
   - **Type:** shared CPU with at least 8 GB of memory, because builds run the project's tests.
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
   - check that `ssh kompass-runner docker ps` works.
3. As `ops`, clone this repository (`git clone https://github.com/DarrenJCoxon/kompass-skills.git ~/kompass-skills`).
4. In `~/kompass-skills/runner`, copy `.env.example` to `.env` and run `chmod 600 .env`. Fill in `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL` from the operator's local `git config`. Add `NOTIFY_URL=https://ntfy.sh/kompass-<random>`, using `openssl rand -hex 10` for the random part.
5. Build the image with `docker compose build`. It takes a few minutes. The image suits Node projects. For another toolchain, add it to `runner/Dockerfile` first, and tell the operator.

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

### 3.4 Phone notifications

1. Ask them to install the free **ntfy** app and subscribe to the topic after `https://ntfy.sh/` in `NOTIFY_URL`. Tell them the topic name; anyone who has it can read the messages.
2. Send a test message with `curl -d "Kompass runner connected" <NOTIFY_URL>` and check that it reached them.

### 3.5 Record the runner

Set `runner: kompass-runner` in the project's `docs/kompass/plan.md` once that file exists (kompass-plan creates it). `kompass-run` starts runs with `ssh kompass-runner '~/kompass-skills/runner/start.sh <owner/repo> --hours 8'`.

## Part 4: start planning

Tell them what happens next, in three lines:
1. Plan with you (`/kompass-plan`): the brief, the module map and mockups for the key screens, ending in one approval.
2. Break the plan into units (`/kompass-units`).
3. Build: one unit with `/kompass-build`, or a whole sequence with `/kompass-run`, which uses the runner when there is one.

Then offer to start `/kompass-plan` now.
