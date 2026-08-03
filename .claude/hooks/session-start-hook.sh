#!/bin/bash
# MedRecord — Session Start Hook (Phase 4)
# SessionStart hook — fires on every new session (startup, resume, clear, compact).
#
# Purpose:
#   1. Read workflow_state.json and inject a summary into Claude's context
#      so cold-start sessions know the current state before touching anything.
#   2. Fail-closed: if workflow_state.json is missing or corrupt, write
#      /tmp/.medrecord_state_corrupted so the agent gate blocks all
#      declarations until a human restores the file.
#
# Output: JSON to stdout with "additionalContext" key.
# Claude Code reads this and prepends it to the session context.
#
# VERIFICATION NOTE: SessionStart hook output injection has a known issue in
# some Claude Code versions where the hook executes but additionalContext
# is not injected for brand-new conversations. Test by opening a fresh
# session and checking whether the WORKFLOW STATE block appears in context.
# If it does not appear, the UserPromptSubmit hook (which fires on every
# prompt) is the fallback nudge mechanism, and the agent gate's file checks
# remain the mechanical enforcement layer.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKFLOW_STATE="$PROJECT_ROOT/.claude/state/workflow_state.json"
REGISTRY="$PROJECT_ROOT/.claude/state/agent-registry.json"
CORRUPTED_FLAG="/tmp/.medrecord_state_corrupted"
LOG_HELPER="$SCRIPT_DIR/log-event.py"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

python3 << PYEOF
import json, sys, os, subprocess

state_path = "$WORKFLOW_STATE"
registry_path = "$REGISTRY"
corrupted_flag = "$CORRUPTED_FLAG"
log_helper = "$LOG_HELPER"
timestamp = "$TIMESTAMP"
project_root = "$PROJECT_ROOT"

def log(event, detail):
    try:
        subprocess.run(["python3", log_helper, event, detail, "SessionStart", ""],
                       capture_output=True)
    except:
        pass

# ── Read workflow state ────────────────────────────────────────────────────────
try:
    state = json.load(open(state_path))
    # Clear any stale corrupted flag from a previous bad session
    if os.path.exists(corrupted_flag):
        os.remove(corrupted_flag)
    state_ok = True
except FileNotFoundError:
    log("session_start_state_missing", f"path={state_path}")
    open(corrupted_flag, "w").write("missing")
    state_ok = False
    state = {}
except Exception as e:
    log("session_start_state_corrupt", f"error={e}")
    open(corrupted_flag, "w").write("corrupt")
    state_ok = False
    state = {}

# ── Build context summary ──────────────────────────────────────────────────────
lines = []
lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
lines.append("  MEDRECORD WORKFLOW STATE — injected at session start")
lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

if not state_ok:
    lines.append("")
    lines.append("  ⚠  STATE FILE UNREADABLE — all agent declarations BLOCKED")
    lines.append("     until a human reviews and restores:")
    lines.append(f"     {state_path}")
    lines.append("")
    lines.append("  Do not attempt to work around this.")
    lines.append("  Read docs/project-state.md and tell the user what you find.")
else:
    defects_open = state.get("defects_open", False)
    required_next = state.get("required_next_agent") or "—"
    current_feature = state.get("current_feature") or "—"
    current_stage = state.get("current_stage") or "—"
    defect_count = state.get("defect_count", 0)
    last_updated = state.get("last_updated") or "never"

    lines.append("")
    lines.append(f"  Feature:        {current_feature}")
    lines.append(f"  Stage:          {current_stage}")
    lines.append(f"  Defects open:   {'YES — ' + str(defect_count) + ' defect(s)' if defects_open else 'No'}")
    lines.append(f"  Required next:  {required_next if defects_open else '(see docs/project-state.md)'}")
    lines.append(f"  Last updated:   {last_updated}")

    if defects_open:
        lines.append("")
        lines.append(f"  ⚠  Rework loop active. Only {required_next} may start.")
        lines.append("     Read docs/project-state.md then declare the correct agent.")
        defects = state.get("defects", [])
        if defects:
            lines.append("")
            lines.append("  Open defects:")
            for d in defects[:5]:
                lines.append(f"    [{d.get('severity','?')}] {d.get('id','?')} — {d.get('description','')[:60]}")
            if len(defects) > 5:
                lines.append(f"    ... and {len(defects)-5} more (see testing-report.json)")
    else:
        lines.append("")
        lines.append("  No defects open. Read docs/project-state.md to determine")
        lines.append("  the correct agent and declare before doing any work.")

lines.append("")
lines.append("  Rule: every file write requires a declared agent.")
lines.append("        Declare first. Work second. No exceptions.")
lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

context = "\n".join(lines)
log("session_start_context_injected", f"state_ok={state_ok} defects_open={state.get('defects_open', False)}")
print(json.dumps({"additionalContext": context}))
PYEOF
