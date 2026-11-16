#!/usr/bin/env bash
# usage (on the server, as the user who runs Docker): monitor.sh
# Keeps an always-on Claude session ("Kompass monitor") in tmux with Remote Control, so the operator can
# steer runs from the Claude app on their phone with their laptop shut. Restarts it if it exits (Remote
# Control gives up after about ten minutes without network). Safe to run again: it does nothing when the
# monitor is already up. Started at boot by the crontab line SETUP.md adds.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
home_dir="$HOME/kompass-monitor"
mkdir -p "$home_dir/repos" "$HOME/.claude"
cp "$here/monitor/CLAUDE.md" "$home_dir/CLAUDE.md"
# The monitor uses the same skills and agents as the runner's sessions, linked one by one so Claude Code's
# own files (for example its synced skills) never land in ~/kompass-skills.
for d in skills agents; do
  [ -L "$HOME/.claude/$d" ] && rm "$HOME/.claude/$d" # an older monitor.sh linked the whole folder
  mkdir -p "$HOME/.claude/$d"
  for f in "$here/../$d"/*; do [ -e "$HOME/.claude/$d/$(basename "$f")" ] || ln -s "$f" "$HOME/.claude/$d/$(basename "$f")"; done
done

if tmux has-session -t kompass-monitor 2>/dev/null; then echo "Kompass monitor already running (tmux attach -t kompass-monitor)"; exit 0; fi

# GitHub access for records pull requests: the runner's own token, read inside the session so it never
# appears in a process list.
# Code Mode trial (16 Nov 2026), for the monitor only: Claude Code 2.1.323+ lets the model write a short script
# that gathers and filters, so only the result enters its context. The CLI is updated first, quietly; if it can't
# be, the monitor still starts, saying Code Mode is off. Unit sessions don't get it until this trial is judged.
tmux new-session -d -s kompass-monitor -c "$home_dir" \
  "export GH_TOKEN=\"\$(grep -m1 '^GH_TOKEN=' '$here/.env' | cut -d= -f2- | sed -E 's/^\"(.*)\"\$/\\1/')\" PATH=\"\$HOME/.local/bin:\$PATH\" CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1; unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN; gh auth setup-git >/dev/null 2>&1; timeout 300 claude update >/dev/null 2>&1 || true; v=\"\$(claude --version 2>/dev/null | cut -d' ' -f1)\"; [ \"\$(printf '%s\n' 2.1.323 \"\$v\" | sort -V | head -1)\" = 2.1.323 ] || echo \"Claude Code \$v is older than 2.1.323: Code Mode is off\"; while true; do claude remote-control --name 'Kompass monitor'; echo 'Kompass monitor stopped; restarting in 30 s'; sleep 30; done"
echo "Kompass monitor started (tmux attach -t kompass-monitor)"
