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
### Screens in this flow: D2, D3, D6, D7

---

### STEP 1 — PM Agent (run once before touching any screen in this flow)

**Who:** You, in a fresh Claude Code session
**Why:** To confirm this flow solves a real problem before any code is written
**Prompt to paste:**
```
Read agents/agent-pm.md, docs/product-vision.md, docs/project-state.md.

I am about to build the Doctor Visit Flow: screens D2, D3, D6, D7.
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

### STEP 5b — Contract Sync Check (mandatory, same session as Step 5)

**Who:** Builder Agent (continue in the same session as Step 5)
**Why:** Prevent drift between what screens send/expect and what `api-contracts.md` documents.
Every wired screen has introduced undocumented fields in the past — this step closes that gap before the backend developer reads the contracts.

**Checklist (run after wiring the screen):**
```
For every API call the screen makes:
1. Does the request body match what api-contracts.md documents for that endpoint?
   → Any field the screen sends that is NOT in the contract must be added.
2. Does the response shape match what the screen/TypeScript types expect?
   → Any field the screen reads that is NOT in the contract must be added.
3. Are there security constraints implied by the implementation (e.g. "server must
   validate X before trusting Y") that are not documented in the contract?
   → Document them with a NOTE or SECURITY comment in the contract.
4. Are there backend gaps the frontend works around (e.g. a TODO in the API code)?
   → Document them clearly with a NOTE so the backend developer knows what to build.
```

**This step is NOT optional.** Undocumented contracts produce broken backend builds.
If there are no gaps (everything matches), state that explicitly before ending the session.

**Then:** Continue to Step 6 in the same or new session.

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

### STEP 8 — Infrastructure Pre-flight + Device Testing

**Who:** You, in a fresh Claude Code session
**Why:** To validate the screen works on a real device against a real backend — the only true measure of correctness

#### Part A — Infrastructure Pre-flight (run before any test that makes a network call)
```
1. Check Backend Status in docs/project-state.md
2. Run: curl -s -o /dev/null -w "%{http_code}" --max-time 5 <backend-url>/health
3. Confirm test credentials exist (test doctor account)
4. Confirm test mobile number or OTP bypass method is documented
```
If any check fails → declare "Device testing BLOCKED — reason: [reason]" and stop.
Do not proceed to Part B until all checks pass.

#### Part B — Device Testing Session
```
Read reviews/{ScreenID}-qa-test-plan.md.
Read CLAUDE.md Device Testing Rules.

Guide me through each PENDING test case from the test plan one at a time.
For each test:
- Tell me exactly what to do on the device
- Tell me what to observe
- Record my result as PASS / FAIL / SKIP in reviews/{ScreenID}-device-test-session.md
- If FAIL: log the bug with what I observed vs. what was expected. Do NOT fix it now.

After all tests: summarise results and list any bugs found.
```
**Output you expect:** Completed `reviews/{ScreenID}-device-test-session.md` with all results recorded
**Bug fixes:** Start a new Builder Agent session after testing is complete — do not fix mid-session
**Then:** Exit session. Start a new one for Step 9 (bug fixes) if needed, or Step 10 (commit).

---

### STEP 9 — Builder Agent (device-testing bug fixes)

**Who:** You, in a fresh Claude Code session
**Why:** Fix any FAIL results from device testing before committing
**Prompt to paste:**
```
Read docs/project-state.md, agents/agent-builder.md.
Read reviews/{ScreenID}-device-test-session.md — fix all FAIL items.
Do not change anything not listed as a FAIL.
```
**Then:** Re-run affected tests on device to confirm fixes. Re-run Security Agent if any fix touches storage, auth, or PII.

---

### STEP 10 — Commit and Push

**Who:** You, in a fresh Claude Code session (or continue from Step 9)
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

### Then Repeat Steps 2–10 for D3, D6, D7, then run Step 11 before device testing any screen.

> **Note:** D5 (New Patient Form) is a supporting screen, not part of the core flow.
> Build it after D2, D3, D6, D7 are complete (see Tier 3 in screen-inventory.md).

---

### STEP 11 — Backend Build & Deploy

**Who:** You, in a fresh Claude Code session
**When:** After ALL frontend screens for the flow are complete (Steps 2–10 done for every screen in the flow)
**Why:** The backend must exist before any screen can be device-tested against real data

**Prompt to paste:**
```
Read agents/agent-backend.md, docs/api-contracts.md, docs/project-state.md, docs/security-spec.md, docs/data-models.md.

Build and deploy the backend for the [flow name] flow.
Follow agents/agent-backend.md exactly.
Update docs/project-state.md Backend Status section when deployment is confirmed.
```

**Output you expect:**
- All endpoints from api-contracts.md implemented and live
- /health endpoint returns 200
- Test credentials documented in project-state.md
- Backend Status in project-state.md updated to DEPLOYED

**Then:** Exit session. Start a new one for Step 8 (Device Testing) for each screen.

---

Once all four screens are done and the backend is deployed, run the PM agent again (Moment 2):
```
Read agents/agent-pm.md, docs/project-state.md.

The complete Doctor Visit Flow (D2, D3, D6, D7) is now built.
Run your Moment 2 post-flow review and produce the output in the
format specified in your agent file.
```

---

## One Rule to Never Break

Each step is a separate Claude Code session.
Type `exit` when a step is done. Type `claude` to start the next one.
This is what prevents context overload.
