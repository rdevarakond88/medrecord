#!/bin/bash
# MedRecord — User Prompt Submit Hook (Phase 4)
# UserPromptSubmit hook — fires on every user prompt.
#
# Purpose: nudge Claude to declare an agent before doing any work.
# This is NOT enforcement — the PreToolUse agent gate handles that.
# This hook must be fast (30s timeout, output silently discarded if slow).
# No file reads. No logic. Fixed output only.

echo '{"additionalContext": "REMINDER: Any file write requires a named agent declared this session. If no agent is active, read docs/project-state.md first and declare the correct agent before touching any file."}'
