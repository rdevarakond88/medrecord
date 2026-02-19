# Agent Orchestration Guide — MedRecord

This is your single reference for how to run agents in the right order.
Read this before starting any work in Claude Code.

---

## The Big Picture

```
FLOW LEVEL (once per group of screens)
└── PM Agent → validates the flow makes sense for the market

  SCREEN LEVEL (repeat for every individual screen)
  └── Builder → Persona Critic → Builder (fixes) → Builder (data) → Security → QA → Push
```

---

## Worked Example: Doctor Visit Flow
### Screens in this flow: D2, D5, D6, D7

---

### STEP 1 — PM Agent (run once before touching any screen in this flow)

**Who:** You, in a fresh Claude Code session
**Why:** To confirm this flow solves a real problem before any code is written
**Prompt to paste:**
```
Read agents/agent-pm.md, docs/product-vision.md, docs/project-state.md.

I am about to build the Doctor Visit Flow: screens D2, D5, D6, D7.
Run your Moment 1 pre-flight review and produce the output in the
format specified in your agent file.
```
**Output you expect:** PM review report — green light to proceed, or specific concerns to address first
**Then:** Exit session. Start a new one for Step 2.

---

### STEP 2 — Builder Agent (mockup)

**Who:** You, in a fresh Claude Code session
**Why:** Build the first screen as a static visual — no real data yet
**Prompt to paste:**
```
Read docs/project-state.md, docs/ui-ux-spec.md, agents/agent-builder.md.

Build a static mockup of D2: Patient Search screen.
Use realistic Indian placeholder data.
Show three states: empty, has data, offline.
Do not wire up any real API calls.
```
**Output you expect:** A working React Native screen file with placeholder data
**Then:** Exit session. Start a new one for Step 3.

---

### STEP 3 — Persona Critic Agent

**Who:** You, in a fresh Claude Code session
**Why:** Five real user perspectives score the screen before you build further
**Prompt to paste:**
```
Read agents/agent-persona-critic.md and mockups/screen-inventory.md.

Evaluate the screen I am pasting below.
Produce the full critique report in the format your agent file specifies.

[paste the screen code or describe what was built]
```
**Output you expect:** Scored critique with MUST FIX, SHOULD FIX, NICE TO HAVE, and a verdict
**Then:** Read the report yourself. Decide what to fix. Exit session.

---

### STEP 4 — Builder Agent (fixes)

**Who:** You, in a fresh Claude Code session
**Why:** Apply only the MUST FIX items from the critique
**Prompt to paste:**
```
Read docs/project-state.md, agents/agent-builder.md.

Here is the persona critique for D2: [paste critique report]

Revise the D2 screen to address all MUST FIX items only.
Do not change NICE TO HAVE items without asking me first.
```
**Output you expect:** Revised screen file
**Then:** Exit session.

---

### STEP 5 — Builder Agent (wire up real data)

**Who:** You, in a fresh Claude Code session
**Why:** Replace placeholder data with real API calls and SQLite queries
**Prompt to paste:**
```
Read docs/project-state.md, docs/api-contracts.md, 
docs/offline-sync-spec.md, agents/agent-builder.md.

The mockup for D2 is approved. Wire it up with:
- Real API call from api-contracts.md
- Local SQLite read for offline state
- Offline sync queue entry on any write operations
```
**Output you expect:** Fully wired screen with offline-first behaviour
**Then:** Exit session.

---

### STEP 6 — Security Agent

**Who:** You, in a fresh Claude Code session
**Why:** Catch any data exposure or consent gaps before QA
**Prompt to paste:**
```
Read docs/security-spec.md, docs/consent-layer-spec.md, 
agents/agent-security.md.

Audit the implementation of D2: Patient Search.
Run your full checklist and produce the security audit report.

[paste the wired screen code]
```
**Output you expect:** Audit report with CRITICAL / HIGH / MEDIUM / LOW findings
**Then:** Fix any CRITICAL or HIGH findings (back to Builder), then exit.

---

### STEP 7 — QA Agent

**Who:** You, in a fresh Claude Code session
**Why:** Catch edge cases and offline failure modes before moving to next screen
**Prompt to paste:**
```
Read docs/offline-sync-spec.md, agents/agent-qa.md.

Produce a full test plan and edge case analysis for D2: Patient Search.

[paste the wired screen code]
```
**Output you expect:** Test plan + list of unhandled edge cases
**Then:** Fix any CRITICAL bugs (back to Builder), then exit.

---

### STEP 8 — Commit and Push

**Who:** You, in a fresh Claude Code session (or continue from Step 7)
**Prompt to paste:**
```
Read docs/project-state.md.

1. Update project-state.md — mark D2 as complete, note any 
   decisions made or open questions
2. Commit all changes to dev branch:
   "[D2] Patient search screen — mockup approved, data wired, 
   security and QA reviewed"
3. Push to GitHub
4. Confirm commit hash
```

---

### Then Repeat Steps 2–8 for D5, D6, D7

Once all four screens are done, run the PM agent again (Moment 2):
```
Read agents/agent-pm.md, docs/project-state.md.

The complete Doctor Visit Flow (D2, D5, D6, D7) is now built.
Run your Moment 2 post-flow review and produce the output in the
format specified in your agent file.
```

---

## Summary Table

| Step | Agent | Runs | Fresh Session? |
|---|---|---|---|
| 1 | PM Agent | Once per flow | Yes |
| 2 | Builder (mockup) | Every screen | Yes |
| 3 | Persona Critic | Every screen | Yes |
| 4 | Builder (fixes) | Every screen | Yes |
| 5 | Builder (wire data) | Every screen | Yes |
| 6 | Security Agent | Every screen | Yes |
| 7 | QA Agent | Every screen | Yes |
| 8 | Commit + Push | Every screen | No (continue from 7) |
| — | PM Agent (Moment 2) | Once per flow | Yes |
| — | PM Agent (Moment 3) | Once before launch | Yes |

---

## One Rule to Never Break

Each step is a separate Claude Code session.
Type `exit` when a step is done. Type `claude` to start the next one.
This is what prevents context overload.
