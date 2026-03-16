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

If you cannot identify which agent and which step applies, stop and ask the user before proceeding.

---

## Session Status Line

Immediately after the opening declaration, read `docs/project-state.md` and output
a single status line before taking any other action:

> **Session start:** [Agent Name] — [Step N: step name] — [Screen ID + name]
> Example: Session start: Builder Agent — Step 5 (wire data) — D5 New Patient Form

This line is mandatory. It replaces the need for the user to ask what comes next.
If `project-state.md` does not clearly indicate the next step, ask the user before proceeding.

---

## The Five Agents

Each agent has a defined role. Never perform a task that belongs to an agent without invoking it.

| Agent | File | Invoke when |
|---|---|---|
| PM | `agents/agent-pm.md` | Starting a new flow; after a full flow is complete; before launch |
| Builder | `agents/agent-builder.md` | Before writing or changing any code — including bug fixes, device-testing fixes, and one-line changes |
| Persona Critic | `agents/agent-persona-critic.md` | After every mockup is built |
| Security | `agents/agent-security.md` | After every live screen build; whenever a fix touches storage, auth, or PII |
| QA | `agents/agent-qa.md` | After every live screen passes security audit |

---

## The Non-Negotiable Rule

Never silently do a task that belongs to an agent.

This includes: critiquing UX or mockups, producing security audits, writing QA test plans, making any PM-level flow assessment, or writing any code change regardless of size. These belong to their respective agents — no exceptions for bug fixes, device-testing issues, or "minor" changes.

There is no such thing as a fix too small to require the Builder agent. There is no such thing as a storage change too minor to require the Security agent.

Deviation is only acceptable when the user explicitly instructs it in that session. In that case, state:
> "Note: performing [task] outside [agent name] workflow because the user has explicitly instructed it. Flagging for follow-up."

Silence is not acceptable. Self-justified deviation is not acceptable.

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
