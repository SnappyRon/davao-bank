#!/usr/bin/env bash
# Bounded, guarded agent loop for Davao Bank.
#
#   scripts/agent-loop.sh <stage> [max_runs]
#   e.g. scripts/agent-loop.sh 7A 8
#
# Runs Claude Code headless, one step per run, in a separate git worktree. It stops when:
#   - the agent writes .agent-stop (STAGE_DONE or BLOCKED);
#   - you create a STOP file in the worktree (touch ../davao-bank-agent/STOP);
#   - two runs in a row make no new commit;
#   - max_runs is reached (default 8).
# Then the reviewer reviews the stage before you start the next one.
#
# Environment overrides:
#   AGENT_BRANCH  branch the agent works on (default phase-7-ui-motion)
#   AGENT_BASE    base for a new branch (default phase-6-5-strong-auth)
#   AGENT_MODEL   model alias or id (default opus = best Opus your Claude Code knows)
#   AGENT_WT      worktree path (default ../davao-bank-agent)
set -uo pipefail

STAGE="${1:-}"
MAX_RUNS="${2:-8}"
if [[ -z "$STAGE" ]]; then
  echo "usage: scripts/agent-loop.sh <stage> [max_runs]   e.g. scripts/agent-loop.sh 7A 8" >&2
  exit 64
fi

MAIN="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${AGENT_BRANCH:-phase-7-ui-motion}"
BASE="${AGENT_BASE:-phase-6-5-strong-auth}"
MODEL="${AGENT_MODEL:-opus}"
WT="${AGENT_WT:-$(cd "$MAIN/.." && pwd)/davao-bank-agent}"
LOGDIR="$MAIN/agent_logs"
GUARD="$MAIN/.claude/agent-loop/guard.py"
SETTINGS="$MAIN/.claude/agent-loop/settings.json"
mkdir -p "$LOGDIR"

# 1. Worktree: the agent's own copy of the repo. It never touches your working folder.
if [[ ! -d "$WT/.git" && ! -f "$WT/.git" ]]; then
  echo "Creating worktree $WT on branch $BRANCH"
  if git -C "$MAIN" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git -C "$MAIN" worktree add "$WT" "$BRANCH" || exit 1
  else
    git -C "$MAIN" worktree add -b "$BRANCH" "$WT" "$BASE" || exit 1
  fi
  # Tests need .env. It stays gitignored and the guard stops the agent from reading it.
  [[ -f "$MAIN/.env" ]] && cp "$MAIN/.env" "$WT/.env"
  echo "Installing dependencies in the worktree (one time)…"
  (cd "$WT" && npm ci --no-audit --no-fund) > "$LOGDIR/setup.log" 2>&1 || { echo "npm ci failed; see $LOGDIR/setup.log" >&2; exit 1; }
fi
# No Supabase CLI link in the worktree, so hosted commands can't target production.
rm -rf "$WT/supabase/.temp"
rm -f "$WT/.agent-stop"

render_prompt() { sed "s/{{STAGE}}/$STAGE/g" "$MAIN/AGENT_PROMPT.md"; }

stuck=0
for ((run = 1; run <= MAX_RUNS; run++)); do
  if [[ -f "$WT/STOP" ]]; then echo "STOP file found. Stopping."; break; fi
  before="$(git -C "$WT" rev-parse --short=7 HEAD)"
  log="$LOGDIR/agent_${STAGE}_run${run}_${before}_$(date +%Y%m%d-%H%M%S).log"
  echo "[$(date +%H:%M:%S)] Run $run/$MAX_RUNS on $before → $log"

  (
    cd "$WT" || exit 1
    # Extra layers: push disabled through git env config; guard active only here.
    export DAVAO_AGENT_LOOP=1 DAVAO_AGENT_WORKTREE="$WT" DAVAO_AGENT_GUARD="$GUARD"
    export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.pushurl GIT_CONFIG_VALUE_0="file:///dev/null/push-disabled-in-agent-loop"
    claude -p "$(render_prompt)" \
      --model "$MODEL" \
      --permission-mode bypassPermissions \
      --settings "$SETTINGS" \
      --output-format text
  ) > "$log" 2>&1
  status=$?

  after="$(git -C "$WT" rev-parse --short=7 HEAD)"
  echo "    exit $status · HEAD $before → $after"

  if [[ -f "$WT/.agent-stop" ]]; then
    echo "Agent stopped the loop: $(cat "$WT/.agent-stop")"
    break
  fi
  if [[ "$before" == "$after" ]]; then
    stuck=$((stuck + 1))
    if ((stuck >= 2)); then echo "Two runs without a new commit. Stopping; check the last logs."; break; fi
  else
    stuck=0
  fi
done

echo
echo "Loop finished. Branch $BRANCH in $WT"
git -C "$WT" log --oneline -8
echo "Next: ask the reviewer to review Stage $STAGE before starting the next stage."
