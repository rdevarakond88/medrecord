#!/bin/bash
# MedRecord — Agent Declaration Gate (v2)
#
# Blocks tool calls unless an agent has been declared for this session.
#
# Before declaration, reads of routing files are allowed so Claude can
# self-determine the correct agent without asking the user:
#   - CLAUDE.md (any path ending in CLAUDE.md)
#   - docs/project-state.md
#   - AGENT_ORCHESTRATION.md
#   - agents/*.md
#
# Declaration sequence:
#   1. Read CLAUDE.md + docs/project-state.md to identify the correct agent
#   2. State the opening declaration in text
#   3. Write the agent name to /tmp/.medrecord_agent (unblocks all tool calls)
#
# Session end: Bash rm -f /tmp/.medrecord_agent

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)
AGENT_FILE="/tmp/.medrecord_agent"

# Agent declared → allow all tool calls
if [ -f "$AGENT_FILE" ] && [ -s "$AGENT_FILE" ]; then
  exit 0
fi

# Allow the Write that creates the declaration file (bootstrap exception)
if [ "$TOOL_NAME" = "Write" ] && [ "$FILE_PATH" = "/tmp/.medrecord_agent" ]; then
  exit 0
fi

# Allow reads of routing files before declaration so Claude can self-route
if [ "$TOOL_NAME" = "Read" ]; then
  case "$FILE_PATH" in
    *CLAUDE.md|*project-state.md|*AGENT_ORCHESTRATION.md|*/agents/*.md)
      exit 0
      ;;
  esac
fi

# Everything else is blocked
cat >&2 << 'BLOCK'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — No agent declared for this session.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  DO NOT ask the user which agent to use.
  You must determine this yourself from the project files.

  Step 1 — Read these files (allowed before declaration):
    • CLAUDE.md              — workflow rules and agent routing table
    • docs/project-state.md  — current state and what comes next

  Step 2 — Identify the correct agent and step.
            The routing table in CLAUDE.md maps project state
            to the exact agent and step that applies.

  Step 3 — State the opening declaration in your response.

  Step 4 — Write the agent name to /tmp/.medrecord_agent
            (this unblocks all subsequent tool calls)

  Valid agents: PM Agent | Builder Agent | Persona Critic
                Security Agent | QA Agent | Device Tester
                Backend Agent | Integration Tester

  At session end: Bash rm -f /tmp/.medrecord_agent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
exit 2
