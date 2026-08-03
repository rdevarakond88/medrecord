#!/bin/bash
# MedRecord — Agent Gate (Phase 1, v1)
#
# Three-stage enforcement:
#
# Stage 1 — Pre-declaration gate
#   Blocks all tool calls until an agent is declared.
#   Exception: reads of routing files are allowed so Claude can self-route.
#   Allowed pre-declaration reads:
#     CLAUDE.md, docs/project-state.md, AGENT_ORCHESTRATION.md, agents/*.md
#
# Stage 2 — Agent validation (fires on Write to /tmp/.medrecord_agent)
#   Two checks, logged as distinct violation types:
#     (a) "no agent declared"  — /tmp/.medrecord_agent absent or empty
#     (b) "unknown agent"      — name not in .claude/state/agent-registry.json
#   Also validates against the NEXT SESSION block in docs/project-state.md.
#
# Stage 3 — Bash command scan (fires on all Bash calls after declaration)
#   Parses tool_input.command for file-modifying operations:
#     rm, mv, sed -i, shell redirects (> >>), heredocs
#   Logs and blocks operations targeting paths outside .claude/ or /tmp/.
#   (Full path/ownership checks come in Phase 2.)
#
# Violation log: .claude/state/violation-log.jsonl
# Declaration sequence:
#   1. Read docs/project-state.md — find NEXT SESSION block → Agent: line
#   2. State opening declaration in text
#   3. Write agent name to /tmp/.medrecord_agent
#   4. All subsequent tool calls unblocked (subject to Stage 3 Bash scan)
# Session end: rm -f /tmp/.medrecord_agent

[ -f /tmp/.medrecord_infra ] && exit 0

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)
COMMAND=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

AGENT_FILE="/tmp/.medrecord_agent"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_STATE="$PROJECT_ROOT/docs/project-state.md"
REGISTRY="$PROJECT_ROOT/.claude/state/agent-registry.json"
LOG_HELPER="$SCRIPT_DIR/log-event.py"

log_violation() {
  local type="$1" detail="$2" tool="$3" file="${4:-}"
  python3 "$LOG_HELPER" "$type" "$detail" "$tool" "$file" 2>/dev/null
}

log_allow() {
  local event="$1" detail="$2" tool="${3:-}" file="${4:-}"
  python3 "$LOG_HELPER" "$event" "$detail" "$tool" "$file" 2>/dev/null
}

# ── Stage 2: Agent validation ─────────────────────────────────────────────────
# Intercept the Write that creates the declaration file.
if [ "$TOOL_NAME" = "Write" ] && [ "$FILE_PATH" = "/tmp/.medrecord_agent" ]; then
  DECLARED=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('content','').strip())" 2>/dev/null)

  # Check 0: Fail-closed on unreadable workflow state.
  # SessionStart hook sets this flag when workflow_state.json is missing/corrupt.
  if [ -f /tmp/.medrecord_state_corrupted ]; then
    REASON=$(cat /tmp/.medrecord_state_corrupted 2>/dev/null)
    log_violation "state_corrupted_block" "declared=$DECLARED reason=$REASON" "Write"
    cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Workflow state unreadable ($REASON).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  .claude/state/workflow_state.json is $REASON.
  All agent declarations are blocked until a human
  reviews and restores the file.

  Once restored, the block clears automatically
  on the next session start.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
    exit 2
  fi

  # Check 1: name must be in the agent registry
  if [ -f "$REGISTRY" ]; then
    IN_REGISTRY=$(python3 -c "
import json, sys
try:
  reg = json.load(open('$REGISTRY'))
  agents = [a.lower().strip() for a in reg.get('agents', [])]
  declared = '$DECLARED'.lower().strip()
  print('yes' if declared in agents else 'no')
except:
  print('error')
" 2>/dev/null)
  else
    IN_REGISTRY="error"
  fi

  if [ "$IN_REGISTRY" = "no" ]; then
    log_violation "unknown_agent" "declared=$DECLARED" "Write"
    cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Unknown agent declared.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Violation type: unknown_agent
  You declared:   $DECLARED

  This name is not in the agent registry:
    $REGISTRY

  Valid agents:
    PM Agent | Builder Agent | Persona Critic
    Security Agent | QA Agent | Device Tester
    Backend Agent | Integration Tester

  Use the exact canonical name. Casing is ignored.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
    exit 2
  fi

  if [ "$IN_REGISTRY" = "error" ]; then
    log_violation "registry_unreadable" "registry=$REGISTRY" "Write"
    cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Agent registry unreadable.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Cannot validate agent declaration without registry.
  Defaulting to deny (fail-closed).

  Fix: ensure .claude/state/agent-registry.json
  is present and valid JSON.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
    exit 2
  fi

  # Check 3 (runs before Check 2): Workflow sequencing gate
  # Sequencing gate is authoritative when defects are open — it overrides
  # the NEXT SESSION block because workflow_state.json is automated (written
  # by the PostToolUse hook on the Testing Agent's report) whereas the NEXT
  # SESSION block is manually maintained. During a rework loop, the two can
  # disagree; sequencing gate wins.
  # If defects are open from a prior Testing Agent run, only the required
  # next agent (Builder Agent) may start. Everyone else is blocked until
  # the rework loop completes.
  WORKFLOW_STATE="$PROJECT_ROOT/.claude/state/workflow_state.json"
  SEQUENCING_OVERRODE_NEXT_SESSION=false
  if [ -f "$WORKFLOW_STATE" ]; then
    SEQ_RESULT=$(python3 -c "
import json, sys
try:
    state = json.load(open('$WORKFLOW_STATE'))
    defects_open = state.get('defects_open', False)
    required = state.get('required_next_agent', '') or ''
    declared = '$DECLARED'.lower().strip()
    req_lower = required.lower().strip()
    if defects_open and req_lower:
        if declared == req_lower:
            # Correct rework agent — override NEXT SESSION block check
            print('OVERRIDE_OK|' + required + '|' + str(state.get('defect_count', 0)))
        else:
            count = state.get('defect_count', 0)
            print('BLOCKED|' + required + '|' + str(count))
    else:
        print('OK')
except Exception as e:
    print('STATE_ERROR|' + str(e))
" 2>/dev/null)

    case "$SEQ_RESULT" in
      OVERRIDE_OK*)
        REQUIRED=$(echo "$SEQ_RESULT" | cut -d'|' -f2)
        COUNT=$(echo "$SEQ_RESULT" | cut -d'|' -f3)
        log_allow "sequencing_override" "agent=$DECLARED is required rework agent defect_count=$COUNT"
        SEQUENCING_OVERRODE_NEXT_SESSION=true
        ;;
      BLOCKED*)
        REQUIRED=$(echo "$SEQ_RESULT" | cut -d'|' -f2)
        COUNT=$(echo "$SEQ_RESULT" | cut -d'|' -f3)
        log_violation "sequencing_violation" "declared=$DECLARED required=$REQUIRED defect_count=$COUNT" "Write"
        cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Workflow sequencing violation.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Violation type: sequencing_violation
  You declared:      $DECLARED
  Required next:     $REQUIRED
  Open defects:      $COUNT

  The last Testing Agent session found defects.
  The rework loop requires $REQUIRED to run next.
  No other agent may start until defects are
  fixed and Testing Agent re-verifies with a
  clean report (status: "pass").

  File: .claude/state/workflow_state.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
        exit 2
        ;;
      STATE_ERROR*)
        REASON=$(echo "$SEQ_RESULT" | cut -d'|' -f2)
        log_violation "workflow_state_unreadable" "declared=$DECLARED reason=$REASON" "Write"
        cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Workflow state unreadable (fail-closed).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  .claude/state/workflow_state.json failed to parse.
  A human must review and restore the state file
  before any agent session can begin.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
        exit 2
        ;;
    esac
  fi

  # Check 2: name must match the NEXT SESSION block
  # Skipped when sequencing gate already approved this agent as the rework agent.
  if [ "$SEQUENCING_OVERRODE_NEXT_SESSION" = "false" ] && [ -f "$PROJECT_STATE" ]; then
    EXPECTED=$(grep -A 10 "## NEXT SESSION" "$PROJECT_STATE" | grep "^Agent:" | head -1 | sed 's/^Agent:[[:space:]]*//' | tr -d '`' | xargs)
    DECLARED_LOWER=$(echo "$DECLARED" | tr '[:upper:]' '[:lower:]' | xargs)
    EXPECTED_LOWER=$(echo "$EXPECTED" | tr '[:upper:]' '[:lower:]' | xargs)

    if [ -n "$EXPECTED" ] && [ "$DECLARED_LOWER" != "$EXPECTED_LOWER" ]; then
      log_violation "wrong_agent" "declared=$DECLARED expected=$EXPECTED" "Write"
      cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Wrong agent for this session.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Violation type: wrong_agent
  You declared:   $DECLARED
  Expected:       $EXPECTED

  The NEXT SESSION block in docs/project-state.md
  specifies the required agent.

  If the NEXT SESSION block is wrong, stop and
  tell the user — never self-override.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
      exit 2
    fi
  fi

  # All checks passed — generate trace_id if this is a new feature
  WORKFLOW_STATE_PATH="$PROJECT_ROOT/.claude/state/workflow_state.json"
  python3 << PYEOF 2>/dev/null
import json, uuid, os

state_path = "$WORKFLOW_STATE_PATH"
declared   = "$DECLARED"

try:
    state = json.load(open(state_path))
except:
    state = {}

if not state.get("current_trace_id"):
    state["current_trace_id"] = "tr-" + str(uuid.uuid4())[:8]
    try:
        open(state_path, "w").write(json.dumps(state, indent=2))
        print(f"[agent-gate] trace_id generated: {state['current_trace_id']}")
    except:
        pass
PYEOF

  log_allow "agent_declared" "agent=$DECLARED" "Write" "/tmp/.medrecord_agent"
  exit 0
fi

# ── Stage 1: Pre-declaration gate ─────────────────────────────────────────────
if [ -f "$AGENT_FILE" ] && [ -s "$AGENT_FILE" ]; then
  # Agent declared — fall through to Stage 3 Bash scan
  :
else
  # No agent declared yet
  # Allow reads of routing files so Claude can self-route without asking user
  if [ "$TOOL_NAME" = "Read" ]; then
    case "$FILE_PATH" in
      *CLAUDE.md|*project-state.md|*AGENT_ORCHESTRATION.md|*/agents/*.md)
        exit 0
        ;;
    esac
  fi

  log_violation "no_agent_declared" "tool=$TOOL_NAME path=$FILE_PATH" "$TOOL_NAME"
  cat >&2 << 'BLOCK'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — No agent declared for this session.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Violation type: no_agent_declared

  DO NOT ask the user which agent to use.
  You must determine this yourself from the project files.

  Step 1 — Read docs/project-state.md
            Find the NEXT SESSION block at the top of the file.
            The Agent: line tells you exactly which agent to declare.

  Step 2 — State the opening declaration in your response.

  Step 3 — Write the agent name to /tmp/.medrecord_agent
            The hook validates it against:
              (a) the agent registry  (.claude/state/agent-registry.json)
              (b) the NEXT SESSION block  (docs/project-state.md)

  Valid agents: PM Agent | Builder Agent | Persona Critic
                Security Agent | QA Agent | Device Tester
                Backend Agent | Integration Tester

  At session end: rm -f /tmp/.medrecord_agent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
  exit 2
fi

# ── Stage 3: Bash command scan ────────────────────────────────────────────────
# After a valid agent is declared, scan Bash commands for file-modifying ops.
# Phase 2 will add full ownership checks. Phase 1 checks path scope only.
if [ "$TOOL_NAME" = "Bash" ]; then
  # Special case: block any Bash write to the agent declaration file.
  # Declaration may only be set via the Write tool (which triggers Stage 2
  # validation). A Bash redirect is a bypass attempt — block unconditionally.
  if echo "$COMMAND" | grep -qE '/tmp/\.medrecord_agent' && \
     echo "$COMMAND" | grep -qE '[^>]>[^>&]|>>'; then
    log_violation "bash_agent_file_overwrite" "cmd=$COMMAND" "Bash"
    cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Bash write to agent declaration file.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Violation type: bash_agent_file_overwrite

  The agent declaration file may only be written
  via the Write tool — not via Bash redirects.
  This ensures the agent name is validated against
  the registry and NEXT SESSION block first.

  To declare: use Write tool → /tmp/.medrecord_agent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
    exit 2
  fi

  IS_MODIFYING=false

  if echo "$COMMAND" | grep -qE '(^|[[:space:];&|])(rm |mv )|sed[[:space:]]+-i'; then
    IS_MODIFYING=true
  fi
  if echo "$COMMAND" | grep -qE '[^>]>[^>&=]|[^<]>>[^>]'; then
    IS_MODIFYING=true
  fi
  # Heredoc targeting a file (cat << ... > file or tee file)
  if echo "$COMMAND" | grep -qE '(<<[[:space:]]*[A-Z]+.*>|tee[[:space:]]+[^-])'; then
    IS_MODIFYING=true
  fi

  if [ "$IS_MODIFYING" = "true" ]; then
    # Extract likely target paths from the command
    # For now, log the command and allow — full path enforcement in Phase 2
    # Block only if command targets known restricted root paths directly
    if echo "$COMMAND" | grep -qE '(rm|mv|sed[[:space:]]+-i|>>?)[[:space:]]+(src/|docs/|agents/|reviews/|App\.tsx|package\.json)'; then
      log_violation "bash_file_modify_restricted_path" "cmd=$COMMAND" "Bash"
      cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Bash is modifying a restricted path.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Violation type: bash_file_modify_restricted_path
  Command: $COMMAND

  File modifications to src/, docs/, agents/,
  reviews/, App.tsx, or package.json via Bash
  are not permitted. Use the Edit or Write tool
  so ownership checks can fire.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
      exit 2
    fi

    # Log the modifying Bash call for the audit trail but allow it
    log_allow "bash_file_modify_allowed" "cmd=$(echo "$COMMAND" | head -c 200)"
  fi
fi

exit 0
