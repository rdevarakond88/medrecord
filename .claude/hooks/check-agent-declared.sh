#!/bin/bash
# MedRecord — Agent Declaration Gate
#
# Blocks every tool call unless an agent has been declared for this session.
# The only exception: a Write to /tmp/.medrecord_agent (which IS the declaration).
#
# How to declare: after stating "Operating as: [Agent Name]" in text,
# use the Write tool to write the agent name to /tmp/.medrecord_agent.
# All subsequent tool calls are then unblocked for this session.
#
# How to clear at session end: Bash rm -f /tmp/.medrecord_agent

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
AGENT_FILE="/tmp/.medrecord_agent"

# Agent declared → allow all tool calls
if [ -f "$AGENT_FILE" ] && [ -s "$AGENT_FILE" ]; then
  exit 0
fi

# Allow the Write that creates the declaration file (bootstrap exception)
if [ "$TOOL_NAME" = "Write" ]; then
  FILE_PATH=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)
  if [ "$FILE_PATH" = "/tmp/.medrecord_agent" ]; then
    exit 0
  fi
fi

# Everything else is blocked
cat >&2 << 'BLOCK'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — No agent declared for this session.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  You must declare your agent BEFORE any tool use.

  Step 1 — State this in your response:
    "Operating as: [Agent Name]
     Step: [step name]
     Spec files I will read before starting: ..."

  Step 2 — Then use the Write tool to write your
  agent name to: /tmp/.medrecord_agent

  Valid agents: PM Agent | Builder Agent | Persona Critic
                Security Agent | QA Agent | Device Tester
                Backend Agent | Integration Tester

  At session end, delete /tmp/.medrecord_agent.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
exit 2
