#!/bin/bash
# MedRecord — Workflow Report Hook (Phase 3)
# PostToolUse hook — fires after every Write.
#
# Purpose: when Testing Agent writes .claude/state/testing-report.json,
# parse it and update workflow_state.json so the sequencing gate knows
# whether defects are open and who must act next.
#
# Expected testing-report.json format:
#   {
#     "agent": "QA Agent",           -- which testing agent produced this
#     "status": "pass" | "fail",     -- overall result
#     "feature": "...",              -- what was being tested
#     "defects": [                   -- empty array if status is "pass"
#       { "id": "...", "severity": "...", "description": "..." }
#     ]
#   }
#
# On "fail": sets defects_open=true, required_next_agent="Builder Agent"
# On "pass": sets defects_open=false, required_next_agent=null
# On parse error: logs warning but does NOT update state (fail-safe — keeps
#   existing defects_open value, which defaults to false on a fresh state)

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)

# Only relevant for Write
[ "$TOOL_NAME" != "Write" ] && exit 0

FILE_PATH=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# Only act on the testing report file
REPORT_FILENAME="testing-report.json"
if [[ "$FILE_PATH" != *"$REPORT_FILENAME" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORT_PATH="$PROJECT_ROOT/.claude/state/testing-report.json"
WORKFLOW_STATE="$PROJECT_ROOT/.claude/state/workflow_state.json"
LOG_HELPER="$SCRIPT_DIR/log-event.py"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

python3 << PYEOF 2>/dev/null
import json, sys, subprocess, os

report_path  = "$REPORT_PATH"
state_path   = "$WORKFLOW_STATE"
log_helper   = "$LOG_HELPER"
timestamp    = "$TIMESTAMP"

def log(event, detail):
    subprocess.run(
        ["python3", log_helper, event, detail, "Write", report_path],
        capture_output=True
    )

try:
    report = json.load(open(report_path))
except Exception as e:
    log("report_parse_error", f"file={report_path} error={e}")
    sys.exit(0)  # Don't update state on bad report — keep existing state

required_fields = ["status", "defects"]
missing = [f for f in required_fields if f not in report]
if missing:
    log("report_missing_fields", f"missing={missing}")
    sys.exit(0)

status = report.get("status", "").lower().strip()
if status not in ("pass", "fail"):
    log("report_invalid_status", f"status={status}")
    sys.exit(0)

defects = report.get("defects", [])
defects_open = (status == "fail") and len(defects) > 0
required_next = "Builder Agent" if defects_open else None

try:
    state = json.load(open(state_path))
except:
    state = {}

state.update({
    "current_feature": report.get("feature", state.get("current_feature")),
    "current_stage": "post-testing",
    "defects_open": defects_open,
    "required_next_agent": required_next,
    "defect_count": len(defects),
    "defects": defects,
    "last_testing_report": report_path,
    "last_updated": timestamp
})

open(state_path, "w").write(json.dumps(state, indent=2))

log("workflow_state_updated", f"status={status} defects_open={defects_open} required_next={required_next}")
print(f"[workflow-report-hook] Testing report processed: status={status}, defects={len(defects)}, required_next={required_next}")
PYEOF

exit 0
