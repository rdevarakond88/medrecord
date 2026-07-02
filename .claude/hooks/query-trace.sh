#!/bin/bash
# MedRecord — Trace ID Lineage Query (Phase 5)
# Reconstructs the complete lifecycle of a feature by filtering the audit log.
#
# Usage:
#   bash query-trace.sh <trace_id>          — full lineage for one feature
#   bash query-trace.sh --list              — list all trace_ids in the log
#   bash query-trace.sh --summary           — one-line summary per trace_id

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_PATH="$(cd "$SCRIPT_DIR/../.." && pwd)/.claude/state/violation-log.jsonl"

python3 << PYEOF
import json, sys, os
from collections import defaultdict

log_path = "$LOG_PATH"
arg = "${1:-}"

if not os.path.exists(log_path):
    print(f"No log file found at: {log_path}")
    sys.exit(1)

entries = []
with open(log_path) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except:
            pass

if arg == "--list":
    ids = sorted(set(e.get("trace_id","") for e in entries if e.get("trace_id","") not in ("","no-trace")))
    print(f"Trace IDs in log ({len(ids)} features):")
    for t in ids:
        count = sum(1 for e in entries if e.get("trace_id") == t)
        print(f"  {t}  ({count} events)")
    sys.exit(0)

if arg == "--summary":
    by_trace = defaultdict(list)
    for e in entries:
        tid = e.get("trace_id","no-trace")
        by_trace[tid].append(e)
    for tid, evts in sorted(by_trace.items(), key=lambda x: x[1][0].get("timestamp","")):
        agents = sorted(set(e.get("agent","") for e in evts if e.get("agent")))
        violations = sum(1 for e in evts if "violation" in e.get("event","") or "deny" in e.get("event",""))
        print(f"{tid}  agents={','.join(agents)}  events={len(evts)}  violations={violations}")
    sys.exit(0)

trace_id = arg
if not trace_id:
    print("Usage: bash query-trace.sh <trace_id>")
    print("       bash query-trace.sh --list")
    print("       bash query-trace.sh --summary")
    sys.exit(1)

matched = [e for e in entries if e.get("trace_id") == trace_id]
if not matched:
    print(f"No entries found for trace_id: {trace_id}")
    sys.exit(0)

print(f"Feature lineage — trace_id: {trace_id}")
print(f"Events: {len(matched)}  |  First: {matched[0].get('timestamp','')}  |  Last: {matched[-1].get('timestamp','')}")
print("=" * 70)

ICONS = {
    "allow": "✓", "allow_": "✓", "declared": "✓", "registered": "✓",
    "violation": "✗", "deny": "✗", "block": "✗", "error": "⚠",
}

for e in matched:
    event   = e.get("event", "")
    agent   = e.get("agent") or "—"
    tool    = e.get("tool")  or "—"
    file_p  = e.get("file")  or ""
    detail  = e.get("detail","")
    ts      = e.get("timestamp","")

    icon = "•"
    for k, v in ICONS.items():
        if k in event.lower():
            icon = v
            break

    print(f"{icon} {ts}  [{event}]")
    print(f"    agent={agent}  tool={tool}")
    if file_p:
        short = file_p.replace("/home/rdeva/medrecord/", "")
        print(f"    file={short}")
    if detail:
        print(f"    {detail[:120]}")
    print()
PYEOF
