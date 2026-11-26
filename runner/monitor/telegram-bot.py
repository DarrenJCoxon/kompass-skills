#!/usr/bin/env python3
"""Stateless, single-user Telegram Kompass Monitor & Triage Approval bot (zero external dependencies)."""
import json, os, re, subprocess, time, urllib.request, urllib.error
from pathlib import Path

HOME = Path.home()
ENV_FILE = HOME / "kompass-skills/runner/.env"
MON_DIR = HOME / "kompass-monitor"
STATE_FILE = MON_DIR / "state.md"
SNAP_SCRIPT = MON_DIR / "monitor-snapshot.sh"

TRIAGE_CB_RE = re.compile(r"^triage:(approve|hold|close):([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+):(\d+)$")

def load_env(path):
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip("\"'")
    return env

cfg = load_env(ENV_FILE)
TOKEN = cfg["TELEGRAM_BOT_TOKEN"]
ALLOWED_UID = int(cfg["TELEGRAM_ALLOWED_USER_ID"])
GH_TOKEN = cfg.get("GH_TOKEN", "")
API = f"https://api.telegram.org/bot{TOKEN}"

def tg(method, payload=None, timeout=40):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(f"{API}/{method}", data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())

def send(chat_id, text):
    text = text.strip() or "(empty reply)"
    for i in range(0, len(text), 3900):
        tg("sendMessage", {"chat_id": chat_id, "text": text[i:i+3900]})

def run_gh(args):
    env = os.environ.copy()
    env["GH_TOKEN"] = GH_TOKEN
    r = subprocess.run(["gh", *args], env=env, capture_output=True, text=True, timeout=45)
    return r.returncode, (r.stdout + r.stderr).strip()

def handle_triage_callback(cb):
    sender = (cb.get("from") or {}).get("id")
    cb_id = cb.get("id")
    data = (cb.get("data") or "").strip()
    msg = cb.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    msg_id = msg.get("message_id")
    orig_text = msg.get("text") or ""

    if sender != ALLOWED_UID:
        return
    m = TRIAGE_CB_RE.match(data)
    if not m:
        tg("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Unrecognised action"})
        return

    action, repo, pr = m.group(1), m.group(2), m.group(3)
    if action == "approve":
        code, out = run_gh(["pr", "merge", pr, "--repo", repo, "--auto", "--merge", "--delete-branch"])
        status_line = "Approved by Darren — auto-merge armed (lander will merge once green)." if code == 0 else f"Auto-merge failed: {out[:200]}"
    elif action == "hold":
        code, out = run_gh(["pr", "comment", pr, "--repo", repo, "--body", "Held by Darren via Telegram for manual review."])
        status_line = "Held for manual review." if code == 0 else f"Hold comment failed: {out[:200]}"
    else:
        code, out = run_gh(["pr", "close", pr, "--repo", repo, "--comment", "Closed by Darren via Telegram triage."])
        status_line = "Closed by Darren." if code == 0 else f"Close failed: {out[:200]}"

    tg("answerCallbackQuery", {"callback_query_id": cb_id, "text": status_line[:180]})
    if chat_id and msg_id:
        tg("editMessageText", {
            "chat_id": chat_id,
            "message_id": msg_id,
            "text": f"{orig_text}\n\nDecision: {status_line}",
        })

def run_snapshot():
    r = subprocess.run(["bash", str(SNAP_SCRIPT)], capture_output=True, text=True, timeout=30)
    return (r.stdout + r.stderr).strip()

def ask_monitor(user_msg):
    state = STATE_FILE.read_text() if STATE_FILE.exists() else "(no state.md yet)"
    snap = run_snapshot()
    prompt = (
        "You are Darren's Kompass monitor on litebench-ci-new (answering via Telegram). "
        "Keep replies concise, plain English, and phone-friendly. "
        "If anything important changed (decision, blocker, PR merged, waiting on Darren), update ~/kompass-monitor/state.md in place (keep it under 40 lines). "
        "Never print secrets or .env contents.\n\n"
        f"=== state.md ===\n{state}\n\n"
        f"=== live snapshot ===\n{snap}\n\n"
        f"=== Darren's message ===\n{user_msg}\n"
    )
    env = os.environ.copy()
    env["GH_TOKEN"] = GH_TOKEN
    env["PATH"] = f"{HOME}/.local/bin:{env.get('PATH', '')}"
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"):
        env.pop(k, None)
    r = subprocess.run(
        [str(HOME / ".local/bin/agy"), "-p", prompt, "--model", "gemini-4-hydrogen-medium", "--dangerously-skip-permissions"],
        cwd=str(MON_DIR), env=env, capture_output=True, text=True, timeout=600,
    )
    out = (r.stdout or "").strip()
    if not out and r.stderr:
        out = f"Error: {r.stderr.strip()[-600:]}"
    return out or "Done (no output)."

def main():
    offset = 0
    try:
        res = tg("getUpdates", {"timeout": 1})
        if res.get("result"):
            offset = res["result"][-1]["update_id"] + 1
    except Exception:
        pass
    try:
        send(ALLOWED_UID, "Kompass Monitor & Triage Telegram bot is online. Send /status, /state, or tap Approve & merge on triage cards.")
    except Exception:
        pass

    while True:
        try:
            res = tg("getUpdates", {"offset": offset, "timeout": 30}, timeout=45)
            for upd in res.get("result", []):
                offset = upd["update_id"] + 1
                if "callback_query" in upd:
                    handle_triage_callback(upd["callback_query"])
                    continue
                msg = upd.get("message") or {}
                sender = (msg.get("from") or {}).get("id")
                chat_id = (msg.get("chat") or {}).get("id")
                text = (msg.get("text") or "").strip()
                if sender != ALLOWED_UID or not chat_id or not text:
                    continue
                if text in ("/start", "/help"):
                    send(chat_id, "Kompass Monitor ready.\n• /status — instant free fleet & PR snapshot\n• /state — view living state.md\n• Triage cards — tap Approve & merge / Hold / Close PR\n• Any other message — runs stateless monitor turn")
                elif text == "/status":
                    tg("sendChatAction", {"chat_id": chat_id, "action": "typing"})
                    send(chat_id, run_snapshot())
                elif text == "/state":
                    send(chat_id, STATE_FILE.read_text() if STATE_FILE.exists() else "(no state.md)")
                else:
                    tg("sendChatAction", {"chat_id": chat_id, "action": "typing"})
                    send(chat_id, ask_monitor(text))
        except Exception as e:
            print(f"poll error: {e}", flush=True)
            time.sleep(5)

if __name__ == "__main__":
    main()
