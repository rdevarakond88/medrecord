# Governance Decisions Log

This file tracks *design-level* decisions about how MedRecord's hook governance
system itself works — not bug fixes (those live in `docs/project-state.md`
under "Governance Hardening — Backlog"). An entry belongs here when the
question is "how should this system be shaped," not "what's broken."

Each entry uses the same non-technical / technical framing as the Portfolio
Articulation Rule in `/home/rdeva/CLAUDE.md`, so this file can be handed
directly to a stakeholder conversation or an interview prep session without
rewriting it.

---

## 2026-07-13 — Correcting a wrong claim instead of letting it stand

**Situation:** A prior session that day concluded `.claude/` (the folder holding
the hook scripts and their config) was permanently unreachable by any agent,
in any session type — including "infra sessions," a special mode meant
specifically for editing the governance system itself. That conclusion was
based on reading `ownership-registry.json`, which does say `.claude/` has zero
allowed editors. It was committed to the repo and to project memory as fact.

**Tension:** A later session, doing a broader audit, read the actual hook
scripts line by line rather than relying on the earlier summary — and found
that `file-ownership-gate.sh` and `agent-gate.sh` both contain an unconditional
early exit the moment an infra session is active (`[ -f /tmp/.medrecord_infra ]
&& exit 0`). Neither script's registry check ever runs during an infra
session. The "zero editors" rule only applies outside infra mode.

**Decision:** Don't trust the read — verify. Opened a real (harmless,
reversible) infra session and wrote a test file directly into `.claude/state/`.
It succeeded. Deleted it immediately after. The earlier conclusion was wrong;
`.claude/` is exactly what infra sessions are for editing, matching
`infra-session-gate.sh`'s own comment ("purpose: during infrastructure
sessions (hook editing, settings changes)..."). Corrected the repo record
(`docs/project-state.md` finding #6) and project memory rather than letting a
convenient-but-wrong prior conclusion carry forward silently.

**Non-technical framing:** We'd told ourselves a safety mechanism was more
locked-down than it actually was. Rather than quietly keep operating on that
assumption, we tested it directly, found we were wrong, and fixed the written
record — the same discipline you'd want from a person, not just software.

**Technical framing:** Static analysis of access-control config
(`ownership-registry.json`) without reading the enforcement code that actually
consumes it produced a false conclusion — the registry's rule was real, but a
separate script (`file-ownership-gate.sh`) had an unconditional bypass for
this exact scenario that the registry alone didn't reveal. Pattern: when
auditing a permission system, trust the code path that fires at runtime over
the config file that describes intent — they can diverge, and only the former
is ground truth. Failure mode this generalizes to: any layered
authorization system where an inner layer's "deny by default" can be silently
short-circuited by an outer layer's early exit.

---

## 2026-07-13 — Open question: does hook-system maintenance need its own agent?

**Situation:** MedRecord's workflow is enforced by 8 named agents (PM,
Builder, Persona Critic, Security, QA, Device Tester, Backend, Integration
Tester), each with a dedicated spec file, a mandatory opening declaration, and
an End-of-Session Protocol. Editing the hook/governance system itself
currently happens under a ninth, much less formal mechanism: PM Agent writing
a boolean flag file (`/tmp/.medrecord_infra`) with no spec file, no
declaration format, and no End-of-Session Protocol of its own.

**Tension:** The same identity (PM Agent) both audits the governance system
and is empowered to rewrite the rules it's audited against — including, as of
the correction above, the ability to widen its own permitted scope from
inside a session, unsupervised. A dedicated ninth agent would formalize a
separation between "the agent that makes product/business calls" and "the
agent that can edit its own leash." But hook-system edits are rare (roughly
once every couple of weeks of activity in this project), and every additional
agent identity has historically been a source of the exact naming/registry
drift bugs this backlog tracks (see #2, the Device Tester naming mismatch).

**Decision:** Not yet made — this is a recommendation, not a resolution.
Recommendation: don't stand up a full ninth registry agent. Instead, give
infra mode the same rigor as a real agent (a spec file, an explicit "you may
touch `.claude/` — here's exactly what that does and doesn't mean" section,
a mandatory declaration, an End-of-Session Protocol) without adding a new
identity to `agent-registry.json`. Gets most of the accountability benefit
at a fraction of the ongoing cost. User has not yet confirmed this direction.

**Non-technical framing:** Should the person who audits the rulebook also be
allowed to rewrite it, with no second signature? Right now the answer is yes,
informally. The fix isn't necessarily a new role — it's making the existing
role's boundaries explicit and written down, instead of an unwritten
convention.

**Technical framing:** Classic separation-of-duties question in access
control design, applied to an AI agent system rather than a human org chart.
Tradeoff: a dedicated "governance agent" role gives cleaner audit separation
but adds onboarding/maintenance overhead (registry entry, spec file, another
surface for name-mismatch bugs) for a low-frequency task. Failure mode if
left unaddressed: an agent session, under time pressure or a plausible-seeming
justification, quietly widens its own permitted scope and nothing in the
system distinguishes that from a deliberate, reviewed decision.

---

## 2026-07-13 — Corrected: mechanical permission vs. written policy

**Situation:** `ownership-registry.json` grants Backend Agent write access to
`docs/api-contracts.md` and `docs/data-models.md`. `agents/agent-backend.md`
said Backend Agent must never change either file ("if the contract seems
wrong, raise it first"). Found via a static cross-reference audit of all 7
agent spec files against the live registry. The audit's original framing
called this "not a live violation, since no Backend Agent session has
actually exploited the gap" — that framing was checked against the hook's
violation log only, not against git history, and turned out to be wrong.

**First pass (later reversed):** Acting on the "gap never exploited" framing
without verifying it, a PM Agent session tightened the registry to
PM-Agent-only for both files, removing Backend Agent's write access
entirely — reasoning that this closed a defense-in-depth gap the same way
#1/#7 had (mechanical permission wider than written policy).

**Correction:** `git log -- docs/api-contracts.md` shows commit `b9e0325`
(2026-05-10, predating the hook system): `[Backend] POST /sync — patient
update operation for mobile corrections`, which appended a full new payload
spec section to `docs/api-contracts.md` documenting an operation Backend
Agent had just implemented. This is real, accepted, productive use of the
exact access the tightening removed — not a hypothetical risk. The "gap
never exploited" premise was true only in the narrow sense that no *hook
violation* had been logged (hooks didn't exist yet in May); it was false in
the sense that mattered, which is whether the access is actually used and
useful. Acting on an unverified premise from this file, without cross-checking
git history, reproduced the exact failure pattern documented in the
"Correcting a wrong claim instead of letting it stand" entry above —
trusting a written summary over the artifact that shows what actually
happened.

**Decision: RESOLVED 2026-07-13 (revised).** Reverted the registry —
`docs/api-contracts.md` and `docs/data-models.md` both list `PM Agent` and
`Backend Agent` as allowed editors again, matching the original state.
Instead, narrowed the *written* rule in `agents/agent-backend.md`: Backend
Agent may append documentation for a field/payload/table it just
implemented (keeping the contract in sync with what shipped), but may not
redefine, remove, or change the meaning of an existing entry — that still
requires raising it first. This matches what commit `b9e0325` actually did
(additive only) rather than banning the behavior that real practice already
depends on.

**Non-technical framing:** We almost locked a door that was being used
correctly, because the note on file describing the door hadn't been checked
against what actually happens when people walk through it. Checking the
actual history first showed the access was fine — the sign next to the door
was just worded too strictly, so we fixed the sign instead of the lock.

**Technical framing:** A written policy ("must not change X") was treated as
ground truth without corroborating it against the artifact that would prove
or disprove it (`git log`). The correct fix for a policy/practice mismatch
depends on which side is wrong — here the policy was overly broad relative
to accepted practice, not the mechanical access being unjustifiably wide.
Applying the "tighten the registry" pattern from #1/#7 without checking
which side of the mismatch was at fault produced a regression. Generalizes
to: before resolving any "spec says X, system allows Y" finding, check
which of X or Y reflects actual required behavior — don't assume the
stricter reading is automatically the fix.

---

## 2026-08-09 — Resolved: infra mode allowlist widened, and who gets to make that edit

**Situation:** Backlog #6 (see `docs/project-state.md`) tracked a real, narrow
gap: an infra session's write scope was `.claude/` + `/tmp/` only, so a
session fixing a hook-script bug couldn't also update `CLAUDE.md` or
`docs/project-state.md` to reflect that fix — the exact split that happened
on 2026-07-13, when the #2/#4 fixes had to be done as a separate,
non-infra PM Agent session because they touched `CLAUDE.md`. Layered on top
was the open question from the entry above ("does hook-system maintenance
need its own agent?"): `infra-session-gate.sh` lives inside `.claude/`,
which infra mode can already edit — so widening its own allowlist is an
edit the agent could make to itself, unsupervised, from inside the same
session that decided it wanted the wider scope.

**Decision:** Widen the allowlist (substance) — yes, confirmed by the user
after the gap was explained plainly (allowlist has 2 entries, add 2 more,
nothing else changes). Who makes the edit (process) — the user was given
three options: do it themselves, have the agent propose a diff for approval
first, or have the agent make the edit directly inside an infra session with
no extra approval step. **User chose the third option explicitly**, on the
record, rather than the agent defaulting to it. `infra-session-gate.sh` was
edited to add `CLAUDE.md` and `docs/project-state.md` by exact absolute
path (not a broad `docs/` or root-level allow) to `.claude/` + `/tmp/`.

**Verification, not just a read:** before closing this out, the new scope
was tested for real inside the same infra session — an `Edit` to `CLAUDE.md`
succeeded, reverted; an `Edit` to `docs/project-state.md` succeeded,
reverted; an `Edit` to an unrelated file (`docs/product-vision.md`) was
attempted and correctly BLOCKED with the updated error message. All three
outcomes matched what the code change should produce. This follows the same
discipline as the 2026-07-13 entry above ("Don't trust the read — verify") —
the point of testing the negative case (still-blocked file) is that a
widening fix that accidentally loosens *more* than intended would look
identical to a correct fix if you only test the thing you meant to unblock.

**Non-technical framing:** We found a rule that was too narrow (it blocked
legitimate, routine work) and fixed it by widening it by exactly the two
things that were missing — not by opening the door further than that. The
harder part wasn't the fix itself, it was deciding who's allowed to make it,
since the fix touches the very file that controls what the fixer can touch.
Rather than the AI deciding that for itself, the person running the project
was asked directly and made the call on the record.

**Technical framing:** This is the practical resolution of the
separation-of-duties question raised in the entry above, decided narrowly
rather than by standing up new infrastructure: no new agent identity was
created, no formal spec/declaration/End-of-Session protocol was built for
infra mode (the recommendation in that entry remains just a
recommendation). Instead, the specific instance of the risk — an agent
widening its own permitted scope unsupervised — was surfaced explicitly to
a human as a live decision with real alternatives (manual edit, proposed-diff
review, direct self-edit) before being acted on, and the choice made is
attributable to the user, not inferred or defaulted to by the agent. This
generalizes to: when a system can't structurally prevent self-modification,
the fallback is making the decision to allow it explicit and logged, not
silent — a compensating control rather than an architectural one.
