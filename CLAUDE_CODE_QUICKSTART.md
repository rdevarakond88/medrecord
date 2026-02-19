# Claude Code Quickstart — MedRecord

This file is your operating manual for working with Claude Code on this project. Read it before every session.

---

## How to Start a Session

Every Claude Code session begins with this context injection:

```
You are working on MedRecord, a healthcare records app for India's semi-urban clinics.

Read these files before doing anything:
- docs/project-state.md        ← current status and locked decisions
- docs/product-vision.md       ← what we're building and why
- agents/agent-builder.md      ← your role and ground rules

Then tell me what you've read and confirm you're ready to proceed.
```

---

## How to Build a Screen (Step-by-Step Workflow)

### Step 1: Build the Mockup
```
Using agents/agent-builder.md as your role definition, build a static mockup
of [Screen ID: Screen Name] from docs/ui-ux-spec.md.

Use realistic Indian placeholder data. Wire nothing to real APIs yet.
Show: empty state, data state, and offline state.
```

### Step 2: Run Persona Critique
Open a new Claude Code session (or continue in same, but be aware of context):
```
Using agents/agent-persona-critic.md as your role, evaluate the following
screen implementation: [paste or reference the built screen]

Produce a full critique report in the format specified in your agent file.
```

### Step 3: Apply Fixes
```
Based on this persona critique: [paste critique output]
Revise [Screen Name] to address all MUST FIX items.
Do not change anything marked as "nice to have" without asking me first.
```

### Step 4: Wire Up Data (After Mockup Approved)
```
The mockup for [Screen Name] is approved. Now wire it up:
- Read docs/api-contracts.md for the relevant endpoints
- Read docs/offline-sync-spec.md for the local SQLite operations
- Implement the real data layer with offline-first behaviour
```

### Step 5: Security Review
```
Using agents/agent-security.md as your role, audit the implementation of
[Screen Name] against the checklist in your agent file and docs/security-spec.md.
```

### Step 6: QA Review
```
Using agents/agent-qa.md as your role, produce a full test plan and edge
case analysis for [Screen Name].
```

### Step 7: Update Project State
```
Update docs/project-state.md to reflect:
- [Screen Name] marked as complete
- Any decisions made during this session
- Any open questions or known debt introduced
```

---

## Context Budget Management

Claude Code has a finite context window. Manage it:

- **Start fresh sessions** for each new screen (don't carry a 10-screen conversation into a new feature)
- **Always inject project-state.md** at the start — it's your memory
- **Never paste the full codebase** into context — reference file paths instead
- **Persona critique sessions** can be separate from builder sessions — they don't need code context, just the screen description or screenshot

---

## Agent Invocation Cheat Sheet

| What you want | Which agent | Key files to reference |
|---|---|---|
| Build a screen | agent-builder.md | ui-ux-spec.md, data-models.md |
| Review from user perspectives | agent-persona-critic.md | screen-inventory.md (rubric) |
| Security review | agent-security.md | security-spec.md, consent-layer-spec.md |
| Test plan + edge cases | agent-qa.md | offline-sync-spec.md |
| Backend API | agent-builder.md | api-contracts.md, data-models.md |
| Sync logic | agent-builder.md | offline-sync-spec.md |

---

## Build Order (Recommended)

1. **D2: Patient Search** — sets the design language for everything
2. **D6: New Visit** — the most critical doctor flow
3. **D7: Document Scanner** — the core feature
4. **D3: Patient Detail** — visit history view
5. **P2: My Records Timeline** — patient view
6. **D1 + P1: Login screens** — quick, mostly boilerplate
7. **D4 + D5: Visit Detail + New Patient** — secondary flows
8. **P3 + P4: Patient visit detail + consent management**
9. **D8 + D9: Scan viewer + Consent flow**
10. **P5: Patient profile**

---

## What "Done" Means for a Screen

A screen is done when:
- [ ] Mockup approved (persona weighted average ≥ 3.5)
- [ ] Real data layer implemented (API + SQLite)
- [ ] Offline state tested and works
- [ ] Security audit: no CRITICAL or HIGH findings
- [ ] QA review: no CRITICAL bugs
- [ ] project-state.md updated
- [ ] All changes committed and pushed to GitHub (dev branch)

---

## End of Every Session — Mandatory GitHub Sync

Before closing any Claude Code session, always run this prompt:

```
Before we finish this session:
1. Update docs/project-state.md — mark what was completed, any decisions made,
   any open questions or known debt introduced
2. Commit all changes to the dev branch with appropriate commit messages
   following the convention in project-state.md
3. Push to GitHub
4. Confirm the push succeeded and tell me the latest commit hash
```

Claude Code with GitHub MCP handles all of this in one instruction. The commit
hash is your recovery anchor — paste it into a WhatsApp message to yourself if
you're about to switch devices or close your laptop for the day.

---

## Resuming on a New Device (Device Lost or Switched)

If starting fresh with nothing local, use this exact prompt in a new Claude Code
session to get back to exactly where you left off:

```
I'm resuming the MedRecord project. Please:

1. Clone the repository from [GitHub repo URL] into the working directory
2. Read docs/project-state.md and summarise the current status —
   what screens are done, what decisions are locked, what's in progress
3. Read CLAUDE_CODE_QUICKSTART.md
4. Tell me what the next step is based on the build order

Do not start building anything until I confirm we're aligned.
```

This works because project-state.md is the project's persistent memory. As long
as it's committed at the end of every session, full context is recoverable from
any device at any time — including by any LLM that can read the repository.

---

## Setting Up the GitHub Repo (One-Time, Do This First)

Before your first Claude Code build session, create the repo:

```
Using the GitHub MCP tool:
1. Create a new private repository named "medrecord" under my GitHub account
2. Add a .gitignore for Node.js and React Native (Expo)
3. Create a dev branch
4. Push all files from the /docs, /agents, and /mockups folders as the
   initial commit with message: "[init] Add full project specification and agent definitions"
5. Confirm repo URL and latest commit hash
```

Once done, fill in the Repo URL field in docs/project-state.md.

---

## Useful Prompts

**When you're stuck on an edge case:**
```
I'm building [feature] and encountered this edge case: [describe].
The offline-sync-spec.md doesn't cover it. What should the behaviour be,
and should this decision be added to project-state.md?
```

**When the spec conflicts with a good idea:**
```
While building [screen], I noticed [observation]. The spec says [X]
but I think [Y] would be better because [reason]. Should we update the spec
or follow it as written?
```

**When you need the security agent mid-build:**
```
I'm about to write the consent check for [endpoint]. Using agent-security.md
as your role, review this specific code and tell me if I'm doing it correctly
before I proceed: [paste code]
```
