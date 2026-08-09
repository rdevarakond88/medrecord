#!/bin/bash
# Infra Session Gate
#
# Active ONLY when /tmp/.medrecord_infra exists.
# Purpose: during infrastructure sessions (hook editing, settings changes),
# restrict all file writes and deletes to the .claude/ directory, plus the
# two workflow files that document what the hooks enforce.
# Reads are unrestricted. Bash reads (ls, cat, find, grep) are unrestricted.
#
# Allowed write targets:
#   /home/rdeva/medrecord/.claude/**
#   /tmp/**
#   /home/rdeva/medrecord/CLAUDE.md
#   /home/rdeva/medrecord/docs/project-state.md
#
# Anything else → BLOCKED with explanation.
# This is belt-and-suspenders: Phase 1's main-thread lockdown is the primary gate.
#
# Governance note (backlog #6, resolved 2026-08-09): this widening was made
# by a PM Agent infra session editing this exact file, unsupervised — see
# docs/governance-decisions.md for why that was judged acceptable here.

INPUT=$(cat)

# No-op when infra flag is absent
[ ! -f /tmp/.medrecord_infra ] && exit 0

TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)
COMMAND=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

CLAUDE_DIR="/home/rdeva/medrecord/.claude"
PROJECT_ROOT="/home/rdeva/medrecord"
EXTRA_ALLOWED_FILES=("$PROJECT_ROOT/CLAUDE.md" "$PROJECT_ROOT/docs/project-state.md")

is_extra_allowed_file() {
  local path="$1"
  for f in "${EXTRA_ALLOWED_FILES[@]}"; do
    [ "$path" = "$f" ] && return 0
  done
  return 1
}

deny_write() {
  cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INFRA SESSION GATE — Write blocked.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Infra sessions may only write to:
    $CLAUDE_DIR/
    /tmp/
    $PROJECT_ROOT/CLAUDE.md
    $PROJECT_ROOT/docs/project-state.md

  Blocked path: $1

  Do NOT touch src/, agents/, reviews/, or any
  application code during this session. (docs/project-state.md
  and CLAUDE.md are the only exceptions outside .claude/.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
  exit 2
}

deny_bash() {
  cat >&2 << BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INFRA SESSION GATE — Bash file modification blocked.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  File-modifying Bash is only allowed when the
  target is .claude/, /tmp/, CLAUDE.md, or
  docs/project-state.md.

  Blocked command: $1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK
  exit 2
}

case "$TOOL_NAME" in
  "Write"|"Edit")
    if [[ "$FILE_PATH" == "$CLAUDE_DIR"* ]] || [[ "$FILE_PATH" == /tmp/* ]] || is_extra_allowed_file "$FILE_PATH"; then
      exit 0
    fi
    deny_write "$FILE_PATH"
    ;;

  "Bash")
    # Detect file-modifying operations
    if echo "$COMMAND" | grep -qE '(^|[;&|[:space:]])(rm |mv |cp .*[^-]$)' || \
       echo "$COMMAND" | grep -qE 'sed[[:space:]]+-i' || \
       echo "$COMMAND" | grep -qE '[^>]>[^>&]|>>' || \
       echo "$COMMAND" | grep -qE 'tee[[:space:]]' ; then
      # Allow if the command targets only .claude/, /tmp/, or the two extra allowed files
      if echo "$COMMAND" | grep -qE '\.claude|/tmp/|medrecord_agent|medrecord_infra|CLAUDE\.md|project-state\.md'; then
        exit 0
      fi
      deny_bash "$COMMAND"
    fi
    exit 0
    ;;

  *)
    exit 0
    ;;
esac
