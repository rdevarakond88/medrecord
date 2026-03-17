# MedRecord — Claude Code Instructions

## Read at the Start of Every Session
1. `docs/project-state.md` — current state of the project
2. `AGENT_ORCHESTRATION.md` — the workflow you must follow

---

## Mandatory Opening Declaration

Before taking any action — reading code, suggesting fixes, writing anything — state:

> "Operating as: [Agent Name]
> Step: [step number and name from AGENT_ORCHESTRATION.md]
> Spec files I will read before starting: [list]"

If you cannot identify which agent and which step applies:
- State what you do know
- Ask ONE specific question to resolve the ambiguity
- **Do nothing else until the user answers**
- "Unclear" is a hard stop, not a declaration that lets you proceed

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

### Infrastructure Pre-flight (mandatory before any device test session)
Before guiding any test that requires a network call:
1. Verify `Backend Status` in `docs/project-state.md`
2. Run a live `curl` check against the backend URL
3. Confirm test credentials and test mobile number exist
4. If ANY of these fail → state "Device testing is BLOCKED — reason: [reason]" and stop

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
