#!/bin/sh
# Installed as /usr/local/sbin/claude, ahead of the real CLI in /usr/local/bin. Claude Code removes its own
# CLAUDE_CODE_OAUTH_TOKEN from the commands a session runs, so a `claude -p` started from a session's command (tertia's
# quality rounds, D-523, 15 Nov 2026) answered "Not logged in". The entrypoint keeps a copy under another name;
# this puts it back, so a nested call signs in with the runner's own subscription token and nothing else.
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -n "${KOMPASS_SUBSCRIPTION_TOKEN:-}" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$KOMPASS_SUBSCRIPTION_TOKEN"; export CLAUDE_CODE_OAUTH_TOKEN
fi
exec /usr/local/bin/claude "$@"
