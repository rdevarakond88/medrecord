#!/bin/bash
# MedRecord — File Ownership Gate (Phase 2)
#
# Fires on Write and Edit only.
# Checks whether the currently-declared agent is allowed to modify the
# target file. Ownership is defined in .claude/state/ownership-registry.json.
#
# Behaviour:
#   - Registry unreadable       → DENY (fail-closed)
#   - No agent declared         → DENY
#   - File registered, agent allowed  → ALLOW + log
#   - File registered, agent not allowed → DENY + log violation
#   - File not registered (new file)  → register it to current agent, ALLOW
#   - Infra session active      → ALLOW (infra-session-gate.sh handles scope)
#
# Violation log: .claude/state/violation-log.jsonl

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)

# Only relevant for Write and Edit
if [ "$TOOL_NAME" != "Write" ] && [ "$TOOL_NAME" != "Edit" ]; then
  exit 0
fi

# Infra session exemption — infra-session-gate.sh handles scope
[ -f /tmp/.medrecord_infra ] && exit 0

FILE_PATH=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)
AGENT_FILE="/tmp/.medrecord_agent"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY="$PROJECT_ROOT/.claude/state/ownership-registry.json"
LOG_HELPER="$SCRIPT_DIR/log-event.py"

log_event() {
  local type="$1" detail="$2"
  python3 "$LOG_HELPER" "$type" "$detail" "$TOOL_NAME" "$FILE_PATH" 2>/dev/null
}

# Bootstrap exemption — the declaration write is already fully validated by
# agent-gate.sh (name checked against the registry + NEXT SESSION block).
# Ownership rules don't apply to this file: it has no "owner", it's the
# switch that turns ownership-checking on in the first place. Without this,
# no session can ever declare an agent (deadlock: this gate requires an
# agent to already be declared before allowing the write that declares one).
if [ "$TOOL_NAME" = "Write" ] && [ "$FILE_PATH" = "/tmp/.medrecord_agent" ]; then
  exit 0
fi

# No agent declared
if [ ! -f "$AGENT_FILE" ] || [ ! -s "$AGENT_FILE" ]; then
  log_event "ownership_deny" "reason=no_agent_declared"
  cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — No agent declared (ownership gate).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  File: $FILE_PATH
  No agent is active. Declare an agent first.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
  exit 2
fi

CURRENT_AGENT=$(cat "$AGENT_FILE" | xargs)

# Registry must be readable — fail-closed if not
if [ ! -f "$REGISTRY" ]; then
  log_event "ownership_deny" "reason=registry_missing agent=$CURRENT_AGENT"
  cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Ownership registry missing (fail-closed).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Expected: $REGISTRY
  Cannot verify file ownership without it.
  Restore the registry before resuming work.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
  exit 2
fi

# Resolve file path relative to project root for registry lookup
REL_PATH="${FILE_PATH#$PROJECT_ROOT/}"

RESULT=$(python3 << PYEOF 2>/dev/null
import json, sys

registry_path = "$REGISTRY"
rel_path = "$REL_PATH"
current_agent = "$CURRENT_AGENT"

try:
    reg = json.load(open(registry_path))
except Exception as e:
    print("REGISTRY_ERROR")
    sys.exit(0)

files = reg.get("files", {})
defaults = reg.get("defaults", {})

# Look up exact path first, then prefix matches (for directory-level entries)
entry = files.get(rel_path)
if entry is None:
    # Try prefix match (e.g. "src/" covers "src/screens/...")
    for key in sorted(files.keys(), key=len, reverse=True):
        if key.endswith("/") and rel_path.startswith(key):
            entry = files[key]
            break

if entry is None:
    # File not in registry — new file, will be registered to current agent
    print("NOT_REGISTERED")
else:
    allowed = [a.lower().strip() for a in entry.get("allowed_editors", [])]
    if current_agent.lower().strip() in allowed:
        print("ALLOWED|" + entry.get("owner", "unknown"))
    else:
        owner = entry.get("owner", "unknown")
        allowed_str = ", ".join(entry.get("allowed_editors", []))
        print("DENIED|" + owner + "|" + allowed_str)
PYEOF
)

case "$RESULT" in
  REGISTRY_ERROR)
    log_event "ownership_deny" "reason=registry_parse_error agent=$CURRENT_AGENT"
    cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Ownership registry is corrupt (fail-closed).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  $REGISTRY failed to parse.
  Fix the JSON before resuming work.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
    exit 2
    ;;

  NOT_REGISTERED)
    # New file — register it to the current agent
    python3 << PYEOF 2>/dev/null
import json, datetime

registry_path = "$REGISTRY"
rel_path = "$REL_PATH"
current_agent = "$CURRENT_AGENT"
timestamp = "$TIMESTAMP"

try:
    reg = json.load(open(registry_path))
    reg["files"][rel_path] = {
        "owner": current_agent,
        "allowed_editors": [current_agent],
        "registered_at": timestamp
    }
    open(registry_path, "w").write(json.dumps(reg, indent=2))
except:
    pass
PYEOF
    log_event "ownership_registered" "agent=$CURRENT_AGENT new_file=$REL_PATH"
    exit 0
    ;;

  ALLOWED*)
    OWNER=$(echo "$RESULT" | cut -d'|' -f2)
    log_event "ownership_allow" "agent=$CURRENT_AGENT owner=$OWNER file=$REL_PATH"
    exit 0
    ;;

  DENIED*)
    OWNER=$(echo "$RESULT" | cut -d'|' -f2)
    ALLOWED_LIST=$(echo "$RESULT" | cut -d'|' -f3)
    log_event "ownership_violation" "agent=$CURRENT_AGENT owner=$OWNER file=$REL_PATH"
    cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — File ownership violation.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  File:            $REL_PATH
  Current agent:   $CURRENT_AGENT
  File owner:      $OWNER
  Allowed editors: $ALLOWED_LIST

  Only the owning agent may modify this file.
  If a handoff is needed, update the registry
  or route through the correct agent.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
    exit 2
    ;;

  *)
    # Unknown result — fail-closed
    log_event "ownership_deny" "reason=unexpected_result result=$RESULT agent=$CURRENT_AGENT"
    exit 2
    ;;
esac
