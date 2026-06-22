#!/bin/bash
# MedRecord — Agent Declaration Gate (v3)
#
# Two-stage enforcement:
#
# Stage 1 — Pre-declaration gate
#   Blocks all tool calls until an agent is declared.
#   Exception: reads of routing files are allowed so Claude can self-route
#   without asking the user:
#     - CLAUDE.md, docs/project-state.md, AGENT_ORCHESTRATION.md, agents/*.md
#
# Stage 2 — Agent validation
#   When Claude writes to /tmp/.medrecord_agent (the declaration act), the
#   hook reads the NEXT SESSION block in docs/project-state.md and rejects
#   the declaration if the agent name doesn't match.
#
# Declaration sequence:
#   1. Read docs/project-state.md — find the NEXT SESSION block, read Agent:
#   2. State the opening declaration in text
#   3. Write the agent name to /tmp/.medrecord_agent
#      → hook validates against NEXT SESSION block before allowing the write
#   4. All subsequent tool calls are unblocked
#
# Session end: Bash rm -f /tmp/.medrecord_agent

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)
AGENT_FILE="/tmp/.medrecord_agent"

# Locate project root relative to this hook file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_STATE="$PROJECT_ROOT/docs/project-state.md"

# ── Stage 2: Agent validation ────────────────────────────────────────────────
# Intercept the Write that creates the declaration file.
# Validate the declared agent against docs/project-state.md before allowing it.
if [ "$TOOL_NAME" = "Write" ] && [ "$FILE_PATH" = "/tmp/.medrecord_agent" ]; then
  DECLARED_AGENT=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('content','').strip())" 2>/dev/null)

  if [ -f "$PROJECT_STATE" ]; then
    EXPECTED_AGENT=$(grep -A 10 "## NEXT SESSION" "$PROJECT_STATE" | grep "^Agent:" | head -1 | sed 's/^Agent:[[:space:]]*//' | tr -d '`' | xargs)

    if [ -n "$EXPECTED_AGENT" ]; then
      DECLARED_LOWER=$(echo "$DECLARED_AGENT" | tr '[:upper:]' '[:lower:]' | xargs)
      EXPECTED_LOWER=$(echo "$EXPECTED_AGENT" | tr '[:upper:]' '[:lower:]' | xargs)

      if [ "$DECLARED_LOWER" != "$EXPECTED_LOWER" ]; then
        cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — Wrong agent declared.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  You declared:  $DECLARED_AGENT
  Expected:      $EXPECTED_AGENT

  The NEXT SESSION block in docs/project-state.md
  specifies the correct agent for this session.

  Re-read docs/project-state.md and declare the
  correct agent. Do not override this check.

  If you believe the NEXT SESSION block is wrong,
  stop and tell the user — never self-override.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
        exit 2
      fi
    fi
  fi

  # Validation passed → allow the declaration write
  exit 0
fi

# ── Stage 1: Pre-declaration gate ────────────────────────────────────────────
# Agent already declared → allow all tool calls
if [ -f "$AGENT_FILE" ] && [ -s "$AGENT_FILE" ]; then
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

  Step 1 — Read docs/project-state.md
            Find the NEXT SESSION block at the top of the file.
            The Agent: line tells you exactly which agent to declare.

  Step 2 — State the opening declaration in your response.

  Step 3 — Write the agent name to /tmp/.medrecord_agent
            The hook will validate it matches the NEXT SESSION block.
            If it doesn't match, the write will be rejected.

  Valid agents: PM Agent | Builder Agent | Persona Critic
                Security Agent | QA Agent | Device Tester
                Backend Agent | Integration Tester

  At session end: Bash rm -f /tmp/.medrecord_agent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
exit 2
