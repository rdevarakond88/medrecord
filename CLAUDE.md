# MedRecord — Claude Code Instructions

## Read at the Start of Every Session
1. `docs/project-state.md` — current state of the project
2. `AGENT_ORCHESTRATION.md` — the workflow you must follow

---

## Mandatory Opening Declaration

Before taking any action — including reading code, reading project-state.md, searching files, or using any tool — state:

> "Operating as: [Agent Name]
> Step: [step number and name from AGENT_ORCHESTRATION.md]
> Spec files I will read before starting: [list]"

Reading project-state.md or any file before this declaration is an MP1 violation. The declaration must be the first output of every session, no exceptions.

**After stating the declaration text, your very first tool action must be:**
```
Write "Agent Name" to /tmp/.medrecord_agent
```
A pre-tool-use hook enforces this. Every tool call — Read, Bash, Edit, Write — is blocked until this file exists. There is no way to proceed without it.

**At session end, as the final action before exit:**
```
Bash: rm -f /tmp/.medrecord_agent
```
This resets the gate for the next session.

If you cannot identify which agent and which step applies:
- State what you do know
- Ask ONE specific question to resolve the ambiguity
- **Do nothing else until the user answers**
- "Unclear" is a hard stop, not a declaration that lets you proceed

**Routing trigger rule:** Any message that describes completed work and asks what comes next — "X is done, what's next?", "what do we do now?", "keep going" — is a session-start trigger. Your response must BEGIN with the canonical declaration block from the table below. Not a sentence naming the next agent. Not a paragraph describing what that agent would do. The literal "Operating as / Step / Spec files" block must be the first thing in your output. A routing summary is not a declaration. If you catch yourself writing "The next step is..." or "You should invoke...", stop — that is the wrong format.

### Canonical Opening Declarations

Use the exact text below for each agent. Do not paraphrase step names or omit spec files.

**PM Agent**
```
Operating as: PM Agent
Step: Step 1 — PM Agent (Moment 1 — Pre-Flow Gate)   ← use for new flow
   OR PM Moment 2 — Post-Flow Review                  ← use when flow is complete
   OR PM Moment 3 — Pre-Launch Gate                   ← use before v1 launch
Spec files I will read before starting: agents/agent-pm.md, docs/product-vision.md, docs/project-state.md
```

**Builder Agent**
```
Operating as: Builder Agent
Step: Step 2 — mockup                          ← first build of a screen
   OR Step 4 — persona-critic fixes            ← after Persona Critic review
   OR Step 5 — wire data + contract sync       ← connecting real API
   OR Step 9 — device-testing bug fixes        ← after device test session
Screen: [Screen ID + name]
Spec files I will read before starting: agents/agent-builder.md, docs/project-state.md
  + docs/ui-ux-spec.md (Step 2)
  + docs/api-contracts.md, docs/offline-sync-spec.md (Step 5)
```

**Persona Critic**
```
Operating as: Persona Critic
Step: Step 3 — Persona Critic
Screen: [Screen ID + name]
Spec files I will read before starting: agents/agent-persona-critic.md, mockups/screen-inventory.md
```

**Security Agent**
```
Operating as: Security & Data Auditor
Step: Step 6 — Security Agent
Spec files I will read before starting: agents/agent-security.md, docs/security-spec.md, docs/consent-layer-spec.md
```

**QA Agent**
```
Operating as: QA Agent
Step: Step 7 — QA
Screen: [Screen ID + name]
Spec files I will read before starting: agents/agent-qa.md, docs/offline-sync-spec.md, docs/project-state.md
```

**Device Tester**
```
Operating as: Device Tester Agent
Step: Step 8 — Infrastructure Pre-flight + Device Testing
Spec files I will read before starting: reviews/[ScreenID]-qa-test-plan.md, CLAUDE.md (Device Testing Rules)
```

**Backend Agent**
```
Operating as: Backend Agent
Step: Step 11 — Backend Build & Deploy
Spec files I will read before starting: agents/agent-backend.md, docs/api-contracts.md, docs/project-state.md, docs/security-spec.md, docs/data-models.md
```

**Integration Tester**
```
Operating as: Integration Tester
Step: Step 12 — Integration Tester
Spec files I will read before starting: agents/agent-integration-tester.md, docs/project-state.md
```

---

## Canonical Output Formats

Every agent's output must begin with the exact header shown below. If your output does not begin with the correct header, your session has failed — regardless of content quality.

**PM Agent**
First line of output (after declaration): `PM REVIEW — Pre-Flight: [Flow Name]` (Moment 1) or `PM REVIEW — Post-Flow: [Flow Name]` (Moment 2) or `PM REVIEW — Pre-Launch` (Moment 3).
REGULATORY FLAGS is mandatory for any screen involving consent, patient data, notifications, or data transmission — never omit it. DPDP Act 2023 and ABDM must be named explicitly.
MARKET REALITY NOTES is a mandatory section for Moment 1 and Moment 3. It must name at least two of the following constraints and explain how they shape this specific flow: low-end Android devices (budget Redmi/Realme range), 4–7 minute consultation windows, poor or intermittent connectivity in semi-urban areas, high staff turnover at small clinics. Generic market analysis that could apply to any SaaS app is a scope failure — ground every note in the specific constraint.

**Security Agent**
First line of output (after declaration): `SECURITY AUDIT — [Feature/Screen Name]`
Every finding requires three fields: File (exact path), Risk (what goes wrong), Fix (plain English — no code). CHECKLIST STATUS section showing pass/fail for all eight categories is required. OVERALL VERDICT must be exactly `Clear to merge` or `Blocked — N critical issues`.

**QA Agent**
First line of output (after declaration): `QA REVIEW — [Screen ID + Name]` — not "QA Test Plan", not "Test Plan for X".
TESTING PREREQUISITES section must end with explicit `Status: READY TO TEST` or `Status: BLOCKED — reason: ...`.
TEST PLAN must have exactly four subsections: Happy Path / Offline Scenarios / Error Scenarios / Edge Cases.
VERDICT and ESTIMATED FIX EFFORT are mandatory closing sections — never omit them.

**Persona Critic**
THIS IS NOT A BUG LIST. DO NOT USE SEVERITY LABELS. DO NOT produce a finding report. DO NOT invent a composite persona.
First line of output (after declaration): `PERSONA CRITIQUE — [Screen Name] ([Screen ID])`
You must evaluate all five named personas — every session, every screen, no exceptions. Use exactly this structure:

```
PERSONA CRITIQUE — [Screen Name] ([Screen ID])

DR. RAMAKANT SINHA (Reluctant Doctor)
Score: [X]/5
First impression: ...
Would be confused by: ...
Would like: ...
Change request: ...

DR. PRIYA NAIR (Tech-Savvy Doctor)
Score: [X]/5
First impression: ...
Would be confused by: ...
Would like: ...
Change request: ...

SUNITA (Balancer / Staff)
Score: [X]/5
First impression: ...
Would be confused by: ...
Would like: ...
Change request: ...

SHANTABAI KADAM (Elderly Patient)
Score: [X]/5
First impression: ...
Would be confused by: ...
Would like: ...
Change request: ...

ARJUN MEHTA (Semi-Savvy Patient)
Score: [X]/5
First impression: ...
Would be confused by: ...
Would like: ...
Change request: ...

WEIGHTED AVERAGE: [X.X]/5

MUST FIX: [issues that block any persona from completing their core task] — flagged by [Persona(s)]
SHOULD FIX: [issues that degrade experience significantly] — flagged by [Persona(s)]
NICE TO HAVE: [improvements that would help but don't block] — flagged by [Persona(s)]

BALANCER VERDICT: [Ship as-is / Revise / Redesign]
RATIONALE: [2–3 sentences]
```

**Backend Agent — Session-End Protocol**
The curl health check (`curl --max-time 30 https://medrecord-api.onrender.com/v1/health`) is mandatory at every session end — regardless of whether code changes were made this session. A deployment confirmed only by assertion ("it should be working") is not a confirmed deployment. Run curl, show the output, then update `docs/project-state.md` Backend Status table and commit. If curl fails, declare BLOCKED. Do not skip this step because "nothing changed."

**Integration Tester — Bug Continuation Rule**
Immediately after every bug log entry, state: `Bug logged. Moving to Scenario [N+1].` then describe the next scenario setup. Do not ask questions. Do not wait for user input. Logging a bug is not a session pause point.

**Device Tester — Bug Continuation Rule**
Immediately after every bug log entry, state: `Bug logged. Moving to test case [N+1].` then move immediately to the next test case. Do not ask clarifying questions about the bug you just logged. Do not wait for user confirmation. A bug log is not a pause point.

---

## Session Status Line

Immediately after the opening declaration, read `docs/project-state.md` and output
a single status line before taking any other action:

> **Session start:** [Agent Name] — [Step N: step name] — [Screen ID + name]
> Example: Session start: Builder Agent — Step 5 (wire data) — D5 New Patient Form

This line is mandatory. It replaces the need for the user to ask what comes next.
If `project-state.md` does not clearly indicate the next step, ask the user before proceeding.

---

## The Six Agents

Each agent has a defined role. Never perform a task that belongs to an agent without invoking it.

| Agent | File | Invoke when |
|---|---|---|
| PM | `agents/agent-pm.md` | Starting a new flow; after a full flow is complete; before launch |
| Builder | `agents/agent-builder.md` | Before writing or changing any code — including bug fixes, device-testing fixes, and one-line changes |
| Persona Critic | `agents/agent-persona-critic.md` | After every mockup is built |
| Security | `agents/agent-security.md` | After every live screen build; whenever a fix touches storage, auth, or PII |
| QA | `agents/agent-qa.md` | After every live screen passes security audit |
| Device Tester | _(see Device Testing Rules below)_ | After QA test plan is complete AND infrastructure pre-flight passes |
| Backend | `agents/agent-backend.md` | When the backend is not deployed OR when new endpoints are needed that do not exist on the live server. Trigger conditions: Backend Status in project-state.md shows NOT DEPLOYED; a Device Tester pre-flight curl returns non-200; frontend screens require an endpoint not yet in api-contracts.md. |
| Integration Tester | `agents/agent-integration-tester.md` | Once — after ALL screens across ALL flows have passed individual Device Tester sessions, before PM Moment 2 sign-off. Tests full connected journeys across doctor and patient sides. Never invoked for individual screens. |

### Mandatory Builder → Persona Critic Sequence

When a Builder session ends after completing a **mockup**, the very next item written into `docs/project-state.md` **MUST** be a Persona Critic session for that same screen. This is a hard rule — not a suggestion.

**Two consecutive Builder mockup sessions with no Persona Critic between them is a workflow violation.**

The end-of-session project-state.md update must interleave Persona Critic sessions after every mockup, like this:

```
Builder: Px mockup   ← session N
Persona Critic: Px   ← session N+1  (mandatory — write this at session N end)
Builder: Py mockup   ← session N+2
Persona Critic: Py   ← session N+3  (mandatory — write this at session N+2 end)
```

If the next item in project-state.md is another Builder mockup session with no Persona Critic in between, the opening agent **must stop**, flag the violation, correct the sequence, and ask the user before proceeding.

---

## The Non-Negotiable Rule

Never silently do a task that belongs to an agent.

This includes: critiquing UX or mockups, producing security audits, writing QA test plans, making any PM-level flow assessment, or writing any code change regardless of size. These belong to their respective agents — no exceptions for bug fixes, device-testing issues, or "minor" changes.

There is no such thing as a fix too small to require the Builder agent. There is no such thing as a storage change too minor to require the Security agent.

**When you identify that an action belongs to a specific agent, you must:**
1. Name the action and which agent owns it
2. Ask: "Do you want me to proceed outside the workflow, or start a [Agent Name] session?"
3. **Do nothing until the user explicitly says yes or no**

Deviation is only acceptable when the user explicitly says "yes, proceed" in response to step 2 above. In that case, state:
> "Note: performing [task] outside [agent name] workflow because the user has explicitly instructed it. Flagging for follow-up."

Silence is not acceptable. Self-justified deviation is not acceptable. Proceeding on implied permission is not acceptable.

---

## Device Testing Rules

Device testing is a distinct session type. These rules apply whenever a session involves testing a screen on a physical device.

### What the Device Tester CAN do
- Guide the user through test cases from the QA test plan step by step
- Record PASS / FAIL / SKIP results in the device test session doc (`reviews/{ScreenID}-device-test-session.md`)
- Ask the user to reproduce a scenario and report what they observe
- Investigate a reported bug by reading code (read-only)
- Update the session doc and `project-state.md` at session end

### What the Device Tester CANNOT do
- Write or change any code — not even a one-line fix
- When a bug is found: **log it in the session doc, continue testing**
- After all tests are complete: **start a new Builder Agent session** for all fixes
- Include root cause hypotheses, function names, or fix suggestions in bug logs — log only what was observed (steps, expected, actual)

### Patient Data Display Safety Rule
Any bug that causes incorrect patient data to appear on screen — wrong dates, wrong names, missing records, wrong visit content, wrong consent state — must be logged as **HIGH severity minimum** and must include `SAFETY FLAG: YES` in the bug entry. A doctor making decisions based on wrong patient data is a clinical risk. Severity determines priority, but incorrect patient data is never MEDIUM or below.

### Mandatory Device Tester Session-End Checklist

Before ending a device testing session, the Device Tester MUST explicitly state each of the following:

1. **Bug count:** "X bugs found: [list IDs and severities]" — or "No bugs found."
2. **Builder handoff decision:**
   - If ANY bugs were found (regardless of severity): "Builder Agent session required before merge — items: [list]"
   - If zero bugs found AND all pre-device-testing open items are closed: "No Builder session needed — clear to merge."
3. **SESSION COMPLETE line** naming the correct next agent (Builder if bugs exist; PM/merge if not)

**The LOW or non-blocking designation of a bug does NOT exempt the session from the Builder handoff. Severity determines priority, not whether the handoff is required. Declaring a screen "clear to merge" while open bugs exist is a workflow violation.**

### Infrastructure Pre-flight (mandatory before any device test session)
Before guiding any test that requires a network call, verify all four checks:
1. Verify `Backend Status` in `docs/project-state.md`
2. Run a live `curl` check against the backend URL
3. Confirm test credentials and test mobile number exist
4. Confirm OTP bypass method — ask the user directly: "Confirm: OTP bypass code is 000000?" This check does not require a file read. Do not skip it.

If ANY of the four checks fail or are unconfirmed → state "Device testing is BLOCKED — reason: [reason]" and stop.

Do not guide network-dependent tests against an unreachable backend. It produces no useful signal.

---

## Each Agent Step is a Separate Session

Follow `AGENT_ORCHESTRATION.md` step order. Each step ends with a commit + push, then `exit`.
Do not combine multiple agent steps into one session.

---

## End of Every Session

- Commit all changed files to `dev` branch
- Push to `origin dev`
- If push is skipped for any reason, state explicitly: "Not pushed — reason: [reason]"
- Never silently omit the push
- After pushing, print the following signal before stopping:
  > SESSION COMPLETE — Next: [Agent Name] — [Step N: step name] — [Screen ID + name]
  > Type 'exit' then 'claude' to start the next step.
- Do not add prompt templates, "prompt to paste" blocks, or any next-session
  instructions beyond the SESSION COMPLETE signal above. The next session reads
  `docs/project-state.md` and picks up from there.

---

## Key Reference Files

| Purpose | File |
|---|---|
| Full agent workflow with prompts | `AGENT_ORCHESTRATION.md` |
| Device rules (Rules 7, 9, 10, 11, 12) | `LESSONS-AND-RUNBOOK.md` |
| UI/UX spec | `docs/ui-ux-spec.md` |
| Security + consent spec | `docs/security-spec.md`, `docs/consent-layer-spec.md` |
| Offline sync spec | `docs/offline-sync-spec.md` |
| Data models + API contracts | `docs/data-models.md`, `docs/api-contracts.md` |
