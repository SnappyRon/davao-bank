#!/usr/bin/env python3
"""PreToolUse guard for the unattended agent loop (scripts/agent-loop.sh).

Loaded only through `claude --settings .claude/agent-loop/settings.json`, so it never
affects normal interactive sessions. Hooks run even in bypassPermissions mode, and
exit code 2 blocks the tool call and shows the reason to the agent.

It is a block list, so treat it as one layer. The other layers are: the separate
worktree, git push disabled through environment config, and no Supabase CLI link in
the worktree.
"""
import json
import os
import re
import sys

WORKTREE = os.path.realpath(os.environ.get("DAVAO_AGENT_WORKTREE", os.getcwd()))


def block(reason: str) -> None:
    print(f"BLOCKED by agent-loop guard: {reason}. See AGENTS.md hard rules.", file=sys.stderr)
    sys.exit(2)


def is_env_file(path: str) -> bool:
    name = os.path.basename(path)
    return bool(re.match(r"^\.env(\..+)?$", name)) and name != ".env.example"


def check_path(path: str, writing: bool) -> None:
    if not path:
        return
    if is_env_file(path):
        block("reading or writing .env files is not allowed")
    full = os.path.realpath(os.path.join(WORKTREE, path) if not os.path.isabs(path) else path)
    if writing and not (full == WORKTREE or full.startswith(WORKTREE + os.sep)):
        block(f"writing outside the agent worktree ({full})")
    if writing and "/.claude/agent-loop/" in full + "/":
        block("the agent may not edit its own guardrails")


# (pattern, reason) checked against the whole Bash command, case-insensitive.
BASH_RULES = [
    (r"\bgit\b[^|;&]*\bpush\b", "git push is reserved for the owner"),
    (r"\bgit\b[^|;&]*\b(reset\s+--hard|clean\s+-[a-z]*f|branch\s+-D|rebase|filter-branch|worktree\s+remove)", "destructive git commands are not allowed"),
    (r"\bgit\b[^|;&]*\bcheckout\s+(--\s+)?\.(\s|$)", "discarding all changes is not allowed"),
    (r"\bgh\b\s", "GitHub CLI (PRs, releases) is reserved for the owner"),
    (r"\bsupabase\b[^|;&]*\b(db\s+(push|reset|pull|dump)|link|unlink|migration\s+(repair|up|squash)|functions\s+deploy|secrets|projects|branches|config\s+push)\b", "changing the hosted Supabase project is reserved for the reviewer"),
    (r"\bpsql\b|\bpg_dump\b", "direct database clients are not allowed"),
    (r"\b(curl|wget)\b", "network downloads are not allowed in the loop"),
    (r"\bnpm\s+audit\s+fix\b", "npm audit fix is not allowed"),
    (r"\bsecurity\s+(find|dump|export)", "keychain access is not allowed"),
    (r"(^|[;&|]\s*)(printenv|env)\s*($|[|;&>])", "printing the environment is not allowed (it contains secrets)"),
    (r"\bsudo\b", "sudo is not allowed"),
]

ALLOWED_INSTALL = {"react-native-reanimated", "react-native-gesture-handler", "react-native-worklets"}


def check_bash(cmd: str) -> None:
    low = cmd.lower()
    for pattern, reason in BASH_RULES:
        if re.search(pattern, low):
            block(reason)

    # Hosted SQL: read-only queries only.
    if re.search(r"\bsupabase\b[^|;&]*\bdb\s+query\b", low) and "--read-only" not in low:
        block("hosted SQL must use --read-only; writes are reserved for the reviewer")

    # Secrets: commands may not name .env, except the two sanctioned ways tests load it.
    if re.search(r"(^|[\s/'\"=])\.env(?!\.example)(\.[a-z]+)?\b", low):
        sanctioned = re.fullmatch(r"\s*set -a;\s*\.\s+\./\.env;\s*set \+a;\s*npx playwright test[^;|&]*", low) or (
            re.search(r"\bnode\b[^;|&]*--env-file=\.env\b", low) and not re.search(r"\b(cat|less|more|head|tail|grep|rg|sed|awk|cp|mv|echo)\b", low)
        )
        if not sanctioned:
            block("commands that read .env are not allowed; use the npm test scripts, which load it themselves")

    # rm -rf only for disposable output folders inside the worktree.
    for m in re.finditer(r"\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+([^;|&]+)|\brm\s+-[a-z]*f[a-z]*r[a-z]*\s+([^;|&]+)", low):
        targets = (m.group(1) or m.group(2) or "").split()
        ok = ("test-results", "playwright-report", "agent_logs", "node_modules/.cache", "dist", ".expo", "coverage")
        for t in targets:
            t = t.strip("'\"")
            if t.startswith("-"):
                continue
            if t.startswith(("/", "~", "..")) or not any(t == o or t.startswith(o + "/") for o in ok):
                block(f"rm -rf is only allowed on disposable output folders, not '{t}'")

    # Dependencies: no new packages except the three Phase 7A names via expo install.
    m = re.search(r"\b(npm\s+(install|i|add)|npx\s+expo\s+install|yarn\s+add|pnpm\s+add)\b(.*)", low)
    if m:
        pkgs = [p for p in re.split(r"\s+", m.group(3).split("&&")[0].split(";")[0].strip()) if p and not p.startswith("-")]
        extra = [p for p in pkgs if re.sub(r"@[^/]*$", "", p) not in ALLOWED_INSTALL]
        if extra:
            block(f"adding dependencies not named in the prompt: {', '.join(extra)}")

    # The guardrails and the main checkout are off limits.
    if "agent-loop/guard.py" in low or "agent-loop/settings.json" in low:
        block("the agent may not touch its own guardrails")


def main() -> None:
    if os.environ.get("DAVAO_AGENT_LOOP") != "1":
        sys.exit(0)
    try:
        data = json.load(sys.stdin)
    except Exception:
        block("could not parse the tool call")
    tool = data.get("tool_name", "")
    inp = data.get("tool_input", {}) or {}
    if tool == "Bash":
        check_bash(inp.get("command", ""))
    elif tool in ("Read", "NotebookRead"):
        check_path(inp.get("file_path", ""), writing=False)
    elif tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        check_path(inp.get("file_path", "") or inp.get("notebook_path", ""), writing=True)
    elif tool in ("Grep", "Glob"):
        target = inp.get("path", "") or ""
        if is_env_file(target) or re.search(r"\.env\b", inp.get("glob", "") or ""):
            block("searching .env files is not allowed")
    sys.exit(0)


if __name__ == "__main__":
    main()
