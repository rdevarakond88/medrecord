# MedRecord — Claude Code Instructions

## Read at the Start of Every Session
1. `docs/project-state.md` — current state of the project
2. `AGENT_ORCHESTRATION.md` — the workflow you must follow

---

## The Five Agents

Each agent has a defined role. Never perform a task that belongs to an agent without invoking it.

| Agent | File | Invoke when |
|---|---|---|
| PM | `agents/agent-pm.md` | Starting a new flow; after a full flow is complete; before launch |
| Builder | `agents/agent-builder.md` | Before writing or changing any code |
| Persona Critic | `agents/agent-persona-critic.md` | After every mockup is built |
| Security | `agents/agent-security.md` | After every live screen build; whenever a fix touches storage, auth, or PII |
| QA | `agents/agent-qa.md` | After every live screen passes security audit |

---

## The Non-Negotiable Rule

Never silently do a task that belongs to an agent.

This includes: critiquing UX or mockups, producing security audits, writing QA test plans, or making any PM-level flow assessment. These belong to their respective agents — even for small fixes or reviews.

If you must deviate (e.g. a minor in-session fix that cannot wait for a new session), you MUST explicitly state:
> "Note: performing [task] outside [agent name] workflow because [specific reason]. Flagging for follow-up."

Silence is not acceptable. Deviation must always be declared.

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
