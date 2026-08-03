#!/usr/bin/env python3
"""
MedRecord — Centralized event logger (Phase 5).
Called by all hooks to write structured, trace_id-stamped entries.

Usage: python3 log-event.py <event_type> <detail> [tool] [file_path]

Every entry includes:
  timestamp   — UTC ISO-8601
  trace_id    — feature-level ID from workflow_state.json (or "no-trace")
  event       — the event type (e.g. "agent_declared", "ownership_violation")
  agent       — currently declared agent from /tmp/.medrecord_agent
  tool        — the Claude Code tool that triggered this (Write, Bash, etc.)
  file        — the file path involved (if any)
  detail      — freeform detail string

Filtering the log by a single trace_id reconstructs the complete lineage
of a feature: every handoff, every denial, every defect opened and closed.
"""
import sys, json, os
from datetime import datetime, timezone

event_type  = sys.argv[1] if len(sys.argv) > 1 else "unknown"
detail      = sys.argv[2] if len(sys.argv) > 2 else ""
tool        = sys.argv[3] if len(sys.argv) > 3 else ""
file_path   = sys.argv[4] if len(sys.argv) > 4 else ""

script_dir   = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(script_dir))
state_dir    = os.path.join(project_root, ".claude", "state")
state_path   = os.path.join(state_dir, "workflow_state.json")
log_path     = os.path.join(state_dir, "violation-log.jsonl")
agent_file   = "/tmp/.medrecord_agent"

trace_id = "no-trace"
try:
    state    = json.load(open(state_path))
    trace_id = state.get("current_trace_id") or "no-trace"
except:
    pass

agent = ""
try:
    agent = open(agent_file).read().strip()
except:
    pass

entry = {
    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "trace_id":  trace_id,
    "event":     event_type,
    "agent":     agent or None,
    "tool":      tool  or None,
    "file":      file_path or None,
    "detail":    detail
}

try:
    with open(log_path, "a") as f:
        f.write(json.dumps(entry) + "\n")
except Exception as e:
    print(f"[log-event] write failed: {e}", file=sys.stderr)
