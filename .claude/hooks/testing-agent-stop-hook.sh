#!/bin/bash
# MedRecord — Testing Agent Stop Hook (Phase 3)
# SubagentStop hook — fires when a subagent is about to stop.
#
# Purpose: if the stopping agent is a Testing Agent (QA Agent, Device Tester,
# Integration Tester), verify that testing-report.json exists and is valid
# before allowing the agent to finish. If the report is missing or broken,
# block the stop and force the agent to produce the report first.
#
# Output format for block:
#   {"decision": "block", "reason": "..."}
#
# LIMITATION: This hook only fires when agents run as Agent tool subagents
# within the same Claude Code session. In MedRecord's current sequential
# session model (each agent is a separate `claude` session), this hook will
# not fire. The PostToolUse hook + sequencing gate in agent-gate.sh are the
# primary enforcement for the rework loop. This hook is a secondary layer
# for workflows that use Agent tool subagents directly.

INPUT=$(cat)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORT_PATH="$PROJECT_ROOT/.claude/state/testing-report.json"
VIOLATION_LOG="$PROJECT_ROOT/.claude/state/violation-log.jsonl"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

TESTING_AGENTS=("QA Agent" "Device Tester" "Integration Tester")

# Get the stopping agent name from the payload
STOP_AGENT=$(echo "$INPUT" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  print(d.get('agent_name', d.get('subagent_type', '')))
except:
  print('')
" 2>/dev/null)

# Check if this is a Testing Agent
IS_TESTING_AGENT=false
for agent in "${TESTING_AGENTS[@]}"; do
  if [ "${STOP_AGENT,,}" = "${agent,,}" ]; then
    IS_TESTING_AGENT=true
    break
  fi
done

[ "$IS_TESTING_AGENT" = "false" ] && exit 0

# Testing Agent is stopping — require the report
RESULT=$(python3 << PYEOF 2>/dev/null
import json, sys

report_path = "$REPORT_PATH"
log_path = "$VIOLATION_LOG"
timestamp = "$TIMESTAMP"
agent = "$STOP_AGENT"

def log(event, detail):
    try:
        open(log_path, "a").write(json.dumps({"timestamp": timestamp, "event": event, "detail": detail}) + "\n")
    except:
        pass

try:
    report = json.load(open(report_path))
except FileNotFoundError:
    log("testing_agent_stop_blocked", f"agent={agent} reason=report_missing")
    print("MISSING")
    sys.exit(0)
except Exception as e:
    log("testing_agent_stop_blocked", f"agent={agent} reason=report_parse_error error={str(e)}")
    print("PARSE_ERROR")
    sys.exit(0)

required = ["status", "defects"]
missing = [f for f in required if f not in report]
if missing:
    log("testing_agent_stop_blocked", f"agent={agent} reason=report_incomplete missing={missing}")
    print("INCOMPLETE|" + str(missing))
    sys.exit(0)

log("testing_agent_stop_allowed", f"agent={agent} status={report.get('status')}")
print("OK")
PYEOF
)

case "$RESULT" in
  OK)
    exit 0
    ;;
  MISSING)
    echo '{"decision":"block","reason":"Testing Agent cannot finish without writing .claude/state/testing-report.json first. Write the report with {\"status\":\"pass\"|\"fail\",\"defects\":[...]} then stop."}'
    exit 0
    ;;
  PARSE_ERROR)
    echo '{"decision":"block","reason":"testing-report.json exists but failed to parse as valid JSON. Fix the report file before stopping."}'
    exit 0
    ;;
  INCOMPLETE*)
    MISSING_FIELDS=$(echo "$RESULT" | cut -d'|' -f2)
    echo "{\"decision\":\"block\",\"reason\":\"testing-report.json is missing required fields: $MISSING_FIELDS. Report must have status (pass|fail) and defects (array).\"}"
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
