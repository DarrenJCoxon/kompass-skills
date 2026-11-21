# Kompass runner: builds a project's work units unattended on the Hetzner box, one fresh Claude Code
# session per unit (scripts/run.mjs). It runs beside the CI runners, never as root, with the Kompass
# skills and agents installed for its user. Secrets come from runner/.env on the box, never the image.
FROM node:22-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl ca-certificates gnupg build-essential python3 python3-venv jq unzip \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && npx -y playwright@1.49.1 install-deps chromium \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Semgrep, the version tertia's CI pins, so sessions run CI's scan before they push.
RUN python3 -m venv /opt/semgrep && /opt/semgrep/bin/pip install --no-cache-dir semgrep==1.176.1 && ln -s /opt/semgrep/bin/semgrep /usr/local/bin/semgrep

# Trivy, the version trivy-action v0.36.0 runs in tertia's CI, so sessions scan dependencies and Dockerfiles before
# they push. Tertia, 13-14 Nov 2026: Trivy refused a new Dockerfile only on main, which stayed red for 35 hours, and
# the session that found it could not run Trivy here (D-478, WU-0889).
RUN curl -fsSL https://github.com/aquasecurity/trivy/releases/download/v0.70.0/trivy_0.70.0_Linux-64bit.tar.gz | tar -xz -C /usr/local/bin trivy \
 && trivy --version

# Claude Code, and fnm so each project's .node-version picks its own Node, as in CI.
RUN npm install -g @anthropic-ai/claude-code \
 && curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /usr/local/bin --skip-shell \
 && corepack enable

RUN useradd --create-home --shell /bin/bash kompass
USER kompass
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 HOME=/home/kompass PATH=/home/kompass/.local/bin:$PATH

# Antigravity CLI (agy) for Google AI Ultra subscription runs (KOMPASS_ENGINE=agy).
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash

# Session histories, Antigravity CLI auth/config, and Playwright's browser live on volumes. Their folders must exist in the image, owned by
# the runner's user, or Docker creates the mount points as root and nothing can be written there.
RUN mkdir -p /home/kompass/.claude/projects /home/kompass/.gemini/antigravity-cli /home/kompass/.gemini/config/skills /home/kompass/.cache/ms-playwright

# The skills and agents, installed for both Claude Code and Antigravity CLI so every session finds them.
COPY --chown=kompass:kompass skills /home/kompass/.claude/skills
COPY --chown=kompass:kompass skills /home/kompass/.gemini/config/skills
COPY --chown=kompass:kompass agents /home/kompass/.claude/agents
COPY --chown=kompass:kompass scripts /opt/kompass/scripts
COPY --chown=kompass:kompass assets /opt/kompass/assets
COPY --chown=kompass:kompass templates /opt/kompass/templates
COPY --chown=kompass:kompass runner/entrypoint.sh /opt/kompass/entrypoint.sh
COPY --chmod=755 runner/claude-signed-in.sh /usr/local/sbin/claude

WORKDIR /work
ENTRYPOINT ["/bin/bash", "/opt/kompass/entrypoint.sh"]
