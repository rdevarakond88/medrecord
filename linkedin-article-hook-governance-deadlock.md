# We Built a Safety Gate for Our AI Agents. The First Time It Ran For Real, It Locked Everyone Out — Including the AI.

**A live deadlock, caught in the act, in a five-layer governance system designed to make an agentic workflow more reliable.**

---

## The setup

MedRecord is an offline-first healthcare records app I'm building for semi-urban Indian clinics, using a fully agentic Claude Code workflow — no developer at a keyboard, just a structured multi-agent system and me directing it. Eight named agents (PM, Builder, Persona Critic, Security, QA, Device Tester, Backend, Integration Tester), each with a defined role, and a hard rule: no agent does another's job, no exceptions for "small" changes.

That rule only works if something enforces it. So the previous session added a governance layer: five "hooks" — small scripts that intercept every single action the AI tries to take (reading a file, running a command, writing a file) and check it against the rules before letting it through. The stated goal, in the commit message, was blunt: **"cold-start hardening."** Make the very first moments of a brand-new session — before any agent has been established — bulletproof.

The next session, I asked a simple follow-up question: *now that this governance system exists, what else could we do to make it more reliable?*

I didn't have to look far for an answer. The system answered the question itself, on the very first tool call.

---

## What happened, in real time

The rule is straightforward: at the start of every session, the AI reads the project's routing file, figures out which of the eight agents it should be, says so out loud, and then writes that agent's name into a small marker file (`/tmp/.medrecord_agent`). Once that file exists, every gate checks it and lets work proceed.

The AI said the words: "Operating as: PM Agent." Then it tried to write the marker file.

**Blocked.** "No agent declared for this session."

It tried a different tool to write the same file. **Blocked again** — same reason.

It tried simply reading an unrelated file to investigate. **Blocked** — same reason, again.

Every avenue was sealed. The one action that was supposed to *resolve* "no agent declared" was itself being refused because no agent had been declared. A locked door where the only key is inside the room.

This wasn't a rare edge case. This is the *first* thing every new session does. As configured, it failed **100% of the time**, with the AI having no way to recover on its own. The only way through was for a human to type a command directly into the terminal — bypassing the AI's tools entirely, which is not something a solo operator running a real clinic pilot would know to do, or should have to.

---

## The diagnosis — with a twist

Here's the part that made this genuinely interesting to untangle: the AI couldn't read the scripts that were blocking it. Every attempt to open the hook's own source code hit the identical "no agent declared" wall. It could describe *what* was happening, from the error messages alone — but not *why*, because the lockout also blocked the investigation.

Once a human manually broke the deadlock from outside, the actual code told a precise story.

**Two separate scripts check the same one thing, and only one of them got the memo:**

- **`agent-gate.sh` (built first) already had the fix.** Its author clearly anticipated this exact problem — there's a dedicated branch in the code that says, in effect: *"if this specific write is creating the declaration file itself, don't apply the normal block — validate the name properly (is it a real agent? does it match what the project state expects?) and let it through if it checks out."* Thoughtful, deliberate, correct.

- **`file-ownership-gate.sh` (built second, its own header literally labeled "Phase 2") never got that exception.** It runs right after the first script, on every file write, asking one blind question: *"Does the declaration file already exist?"* No. Of course not — that's the file being created *right now*. It has no idea it's looking at the one file that's supposed to be exempt. It just says no.

Both scripts have to say yes for anything to proceed. The second one always says no, for this one specific action, no matter what the first one already approved. **One script solved the bootstrap problem. A second script, added later to do a related but different job, silently reintroduced it.**

---

## The pattern underneath it

This wasn't a typo or a rare race condition. It's a more general failure mode worth naming:

**Governance layers don't compose safely just because each one is individually correct.**

`agent-gate.sh` is well-designed for what it checks. `file-ownership-gate.sh` is well-designed for what *it* checks — a genuinely useful, different question ("is this agent allowed to touch *this* file?"). But nobody checked the two scripts *against each other* at the one seam where they overlap: the exact moment an agent is being declared for the first time. Each script was reviewed in isolation. The system was never tested cold — as in, truly starting from zero, with no marker file, no shortcuts, no assumptions carried over from a previous working session.

A safety system that has never been run from a genuinely cold start hasn't actually been tested. It's been tested from a state that already assumes it works.

There's a smaller, related finding worth a footnote: a third script does exist — `infra-session-gate.sh` — with a flag specifically meant to exempt non-standard sessions like this diagnostic one from the whole gate entirely. It just isn't wired up to anything that would set that flag automatically. The escape hatch exists. Nobody built the door to it yet.

---

## The fix — three lines, not a rewrite

The repair matched the diagnosis exactly: give `file-ownership-gate.sh` the identical bootstrap exception `agent-gate.sh` already had.

```bash
if [ "$TOOL_NAME" = "Write" ] && [ "$FILE_PATH" = "/tmp/.medrecord_agent" ]; then
  exit 0
fi
```

One exempted file path, one exempted tool. Every other write, every other file, still goes through the same checks as before — nothing else in the script changed.

Applying it surfaced one more layer worth naming honestly: the hook scripts themselves are locked. `.claude/` — the folder holding every governance script — is registered in the ownership rules as `"owner": "system-only", allowed_editors: []`. No agent, in any role, can edit its own oversight scripts through the normal path. That's a deliberate, correct design choice — an agent shouldn't be able to quietly loosen the rules it's supposed to follow. But it meant the fix itself had to go through a separate, purpose-built "infra session" flag: a temporary mode where the agent and ownership gates step aside and a third script takes over, restricting all writes to only `.claude/` and `/tmp/` — so even in that mode, nothing outside the governance layer itself could be touched. Once the edit landed, the flag came off, and the session went back to normal, ordinary agent-gated rules.

**Verified, not just applied.** Before calling it done: the agent marker and the infra flag were both cleared to simulate a genuinely cold session — no shortcuts, no leftover state from having just fixed it. The exact original failing action was run again: declare "PM Agent," write the marker file. It succeeded on the first try. Then, separately, a fake declaration was pushed through a Bash redirect instead of the sanctioned path — still correctly blocked, exactly as before. The fix closed the one gap it was meant to close, and nothing else moved.

---

## Where this stands now

**Fixed and verified, in the same session it was found.** Three lines added to one script. The chain of discovery — governance system installed → asked "what else could make it more reliable" → hit the deadlock on the very first try → traced it through two scripts and a third undiscovered escape hatch → fixed it → proved the fix under the same cold-start conditions that broke it — happened inside a single conversation.

The larger questions this raised are still open, deliberately: should a hook failure default to blocking everything, or logging and continuing? Should there be a standing test that runs any new governance script from a truly cold state before it ships — the same way you'd never ship code without running it once? Should "infra" work get a first-class lane instead of a flag nobody had wired up yet? Naming one bug precisely, and fixing exactly that bug, is not the same as deciding every policy question it touches. That's the next conversation, not this one.

---

*Building MedRecord in public. The interesting bugs are never in the product — lately, they're in the scaffolding built to protect it.*
