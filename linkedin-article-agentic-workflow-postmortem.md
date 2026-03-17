# We Built an AI-Driven Dev Workflow for a Healthcare App — Then It Failed in a Way Nobody Expected

**And the fix taught us more about agentic AI than six months of building did.**

---

I've been building MedRecord — an offline-first healthcare records app for semi-urban Indian clinics — using a fully agentic Claude Code workflow. No developer on a keyboard writing code. Just me, a structured multi-agent system, and Claude.

The workflow was sophisticated. Five specialised agents, each with defined roles, strict handoffs, and no agent allowed to do another's job:

- **PM Agent** — validates product decisions before any code is written
- **Builder Agent** — writes all code, no exceptions, no matter how small the change
- **Persona Critic** — five real Indian clinic personas score every screen before it's wired
- **Security Agent** — audits every screen for credential handling, PII exposure, consent gaps
- **QA Agent** — writes detailed test plans with edge cases, offline scenarios, and regression tests

The screens were coming out well. D2 (Patient Search), D3 (Patient Detail), D6 (New Visit), D7 (Document Scanner) — all passed security audits, all had comprehensive QA test plans, all had device testing checklists.

Then we got to D1 — the Login / OTP screen. The QA agent ran its full review. Found three MEDIUM bugs. All fixed. Re-audited. Clear. The verdict: **"Ready for device testing."**

So I opened a new session. Loaded the app. Tried to start Test 1.

The app wouldn't even bundle.

---

## Problem One: The Native Module That Broke Expo Go

The first error was `react-native-ssl-pinning` — a native module for certificate pinning, required because the app runs on shared clinic WiFi where MITM attacks are a real threat. The QA test plan had documented it:

> *"UE-6: cert pinning not testable in Expo Go — deferred to EAS custom dev client."*

But the documentation of this edge case didn't prevent the import from crashing the bundle entirely. The app couldn't load in Expo Go at all. Every test, blocked.

The fix was a runtime fallback — if the native module isn't available, use standard `fetch`. One paragraph of code. But it exposed something important: **the QA agent had documented the risk but hadn't translated it into a pre-test infrastructure check.** "Deferred" got treated as "someone else's problem later" when it should have been "confirm this doesn't block you from starting."

Fix: the app now loads in Expo Go. Testing can begin.

---

## Problem Two: The Backend That Didn't Exist

With the bundle fixed, I tried Test 1. Full OTP login flow. Enter a phone number, send OTP, verify, navigate to PatientSearch.

I ran a DNS check on `api.medrecord.in`.

```
socket.gaierror: [Errno -2] Name or service not known
```

The domain doesn't exist. Not "server is down." Not "API is returning errors." The domain has never been registered. There is no backend. There never was.

Ten of the thirteen runnable device tests require a live API. The other three test pure UI validation that fires before any network call.

The QA agent had written a 25-test plan — 22 of which are completely untestable.

---

## What Actually Failed

This wasn't a code bug. It was a **workflow assumption that was never made explicit**.

The entire agent chain — PM → Builder → Security → QA — validated the frontend in isolation. Each agent did its job correctly within its defined scope. The PM agent confirmed the flow solved a real problem. The Builder wrote clean, secure code. The Security agent checked credentials, PII handling, and consent logic. The QA agent found real bugs and wrote rigorous tests.

But nobody in the chain ever asked: **"Does the thing this code calls actually exist?"**

The QA agent's verdict was technically accurate. The frontend code is ready for device testing. The assumption baked into that verdict — that there would be a backend to test against — was invisible. It was never a stated assumption, so it was never checked.

Here's the honest breakdown of where each agent failed to catch it:

| Agent | What it checked | What it missed |
|---|---|---|
| PM Agent | Does this flow solve a real problem? | Is the infrastructure needed to test this planned? |
| Builder | Is the code correct? | Does the API this code calls actually exist? |
| Security | Are credentials handled safely? | Can we exercise this in a real environment? |
| QA | Are edge cases covered? | Can these tests actually be run? |

---

## The Fixes

We made five structural changes to the workflow. Not workarounds — architectural changes that make it impossible for this class of failure to happen silently again.

### 1. QA Test Plans Now Require a Prerequisites Section

Every QA test plan must now open with:

```
TESTING PREREQUISITES:
- Backend URL: [live at <url> / local mock / NOT DEPLOYED]
- Backend status: [reachable — confirmed via curl / UNREACHABLE — device testing blocked]
- Test credentials: [how to obtain]
- Test mobile number: [available / NOT AVAILABLE]
- Status: [READY TO TEST / BLOCKED — reason]
```

A screen cannot be marked "Ready for device testing" unless Status is `READY TO TEST`. If any prerequisite is unknown when QA runs, it must be explicitly marked `BLOCKED`. The assumption is no longer invisible — it is a required field.

### 2. Device Testing is Now a Formal Agent Step

The original workflow had eight steps: PM → Builder → Persona Critic → Builder (fixes) → Builder (data) → Security → QA → Commit. Device testing was a vague "next thing" after QA, not a defined step.

It is now **Step 8**, with its own rules:

- **Infrastructure pre-flight is mandatory before any network test.** Run a `curl` check. Confirm test credentials. Confirm test mobile number or OTP bypass. If any check fails, declare testing blocked and stop — do not proceed.
- **Device Tester cannot fix code.** If a bug is found during testing, log it and continue. Fix it in a new Builder session after all tests are complete.
- The workflow is now PM → Builder → Persona Critic → Builder (fixes) → Builder (data) → Security → QA → **Device Tester (pre-flight + test)** → Builder (fixes if needed) → Commit.

### 3. PM Agent Now Owns Infrastructure Readiness

The PM Agent's Moment 2 review (post-flow) now explicitly asks: *"Is the backend built and reachable? If not, device testing is blocked — state a plan for how it gets resolved before pilot."*

The PM agent's Moment 3 review (pre-launch) now has an infrastructure checklist: backend deployed, all screens device-tested against live backend (not mock), cert pinning validated in EAS build, test credentials for pilot clinic.

This connects product readiness to infrastructure readiness. A flow is not "complete" if the backend doesn't exist.

### 4. Backend Status is a First-Class Field in project-state.md

Every session opens by reading `docs/project-state.md`. That file now has a permanent `Backend Status` section — not buried in notes, not inferable from context, right at the top:

```
Backend Status
- Deployment status: NOT DEPLOYED — domain does not resolve (confirmed 2026-03-17)
- Test environment: None
- Blocker for: D1 device testing (10 of 13 runnable tests)
- Next action: Build and deploy backend
```

Nobody can start a device testing session and discover mid-test that the backend doesn't exist. The status is visible before the first test case.

### 5. "Unclear" is Now a Hard Stop

The AI's opening declaration rule was: "If you cannot identify which agent and which step applies, stop and ask." In practice, the AI would declare "Unclear" and then proceed anyway — interpreting the user's response to the first question as implicit permission.

The rule is now explicit: **"Unclear" is a hard stop, not a declaration that lets you proceed.** When the AI names an action that belongs to an agent, it must ask "do you want me to proceed outside the workflow or start a [Agent] session?" and do nothing until the user explicitly responds. Implied permission is not permission.

---

## What This Taught Me About Agentic Workflows

**Agents execute within their defined scope. They don't see outside it.**

The QA agent was given code to review. It reviewed the code. It didn't know — and wasn't asked — whether the infrastructure the code depends on exists. That's not a failure of the agent. It's a failure of the workflow to include infrastructure as a concern.

**"Ready to proceed" is always relative to unstated assumptions.**

Every agent verdict in this workflow said some version of "ready for the next step." But those verdicts were conditional on assumptions that were never made explicit. The QA agent's "ready for device testing" assumed a live backend. The fix isn't to make agents smarter — it's to make assumptions into explicit required fields.

**The gaps are between agents, not inside them.**

Each agent in this workflow performed well within its scope. The failure happened in the handoff between QA and device testing — a gap that didn't belong to any agent and therefore belonged to none of them. Closing the gap required creating a new agent role (Device Tester) with explicit ownership of the infrastructure check.

**An agentic workflow needs to be audited the same way code does.**

We run Security Agent on every screen. We run QA Agent on every screen. We don't currently run anything that audits the workflow itself. This failure was a workflow bug, not a code bug. It didn't get caught because nobody was assigned to look for it.

---

## Where We Are Now

The workflow is updated. The D1 screen is correctly marked as **device testing blocked — backend not deployed**. The next step is building the backend, which will be done with the same agent discipline applied to the frontend.

The three tests that don't require a backend (pure UI validation) can still be run. The other ten tests are waiting.

And the next QA test plan that gets written will open with a Prerequisites section. The assumption will be a required field.

---

*Building MedRecord in public. Offline-first healthcare records for Indian clinics. The interesting problems are never the ones you plan for.*

*If you're building with agentic AI and want to compare notes on what breaks and what doesn't — I'm interested in the conversation.*
