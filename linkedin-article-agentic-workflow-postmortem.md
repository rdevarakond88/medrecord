# Built an AI-Driven Dev Workflow for a Healthcare App — Then It Failed Three Times in a Row

**Each failure was different. Each one taught us something the previous fix couldn't have caught.**

---

I've been building MedRecord an offline-first healthcare records app for semi-urban Indian clinics — using a fully agentic Claude Code workflow. No developer on a keyboard writing code. Just me, a structured multi-agent system, and Claude.

The workflow was sophisticated. Five specialized agents, each with defined roles, strict handoffs, and no agent allowed to do another's job:

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

## Failure One: The Tool That Nobody Confirmed Would Work

The first error was `react-native-ssl-pinning` — a security library that prevents someone on a shared WiFi network from intercepting the app's data. The QA test plan had actually mentioned it:

> *"UE-6: cert pinning not testable in Expo Go — deferred to EAS custom dev client."*

The note was there. But writing "deferred" in a document didn't stop the library from crashing the app when it tried to load. Expo Go — the tool we were using to test the app on a real phone — can't run this kind of native library. The app wouldn't start at all. Every single test was blocked before Test 1 could begin.

Think of it this way: imagine a delivery company writing in a report *"deliveries to fifth-floor apartments may require elevator access — to be confirmed later"* — and then sending a driver who can't use elevators without ever checking whether the building has one. The risk was documented. The check never happened.

**The fix:** Add a runtime fallback — if the native library isn't available, use the standard alternative. One short block of code. But what it really exposed was this: **documenting a risk and accounting for a risk are two different things.** "Deferred" got treated as "handled" when it should have been "blocked until confirmed."

Fix applied. The app now loads. Testing can begin.

---

## Failure Two: The Backend That Had Never Been Built

With the bundle fixed, I tried Test 1. Full OTP login flow. Enter a phone number, tap Send OTP, enter the code, log in.

I ran a check on the server the app was trying to reach — `api.medrecord.in`.

```
socket.gaierror: [Errno -2] Name or service not known
```

That means: the domain doesn't exist. Not "the server is slow." Not "the API is returning an error." The address has never been registered anywhere on the internet. There is no backend. There never was one.

Ten of the thirteen runnable device tests require a live server. The QA agent had written a 25-test plan — 22 of which were completely impossible to run.

Here is the thing that makes this remarkable: **every agent in the workflow had done its job correctly.**

The PM agent confirmed the flow solved a real problem for clinic staff. The Builder wrote clean, well-structured code. The Security agent checked that passwords weren't being stored carelessly, that patient data was handled with care. The QA agent found real bugs and wrote a rigorous test plan.

But nobody in the entire chain had ever asked: *"Does the thing this code is calling actually exist?"*

The QA agent's verdict — "Ready for device testing" — was technically accurate. The frontend code was ready. The assumption hidden inside that verdict — that a live server would be there when testing started — was invisible. It was never stated, so it was never checked.

| Agent | What it checked | What it never asked |
| --- | --- | --- |
| PM Agent | Does this feature solve a real problem? | Is the infrastructure needed to test this even planned? |
| Builder Agent | Is the code correct and well-structured? | Does the server this code calls actually exist? |
| Security Agent | Are credentials and patient data handled safely? | Can we actually run this in a real environment? |
| QA Agent | Are the edge cases covered? | Can any of these tests actually be run? |

**The fix:** A new Backend Agent was added to the workflow — a dedicated step responsible for building and deploying the server before any device testing begins. Backend deployment is now a formal, required step with a specific output: health check returns 200, test credentials are documented, and the project state file is updated to show the deployment is live. A screen cannot be tested on a real device until the backend pre-flight passes.

---

## Failure Three: The Last-Mile Disconnect

The backend was now built. Deployed to Render. Health check confirmed. Test credentials seeded. The Backend Agent had done everything right.

We opened the next session to begin device testing. The mandatory pre-flight check ran — verify the backend URL in the project state, confirm the frontend is pointing to it.

The frontend was still calling `api.medrecord.in`.

The live backend was at `medrecord-api.onrender.com`.

Two completely different addresses. The old one still didn't exist. One line of code — `const BASE_URL = 'https://api.medrecord.in/v1'` — had been written during early frontend development as a placeholder. When the backend was finally deployed months later in a separate agent session, nobody updated it. The Backend Agent knew where it had deployed the server. The frontend had its address written from a session that happened long before the backend existed. Neither agent was responsible for checking that these two things matched.

If we had gone into device testing without catching this, here is what would have happened:

- **D1 Login:** User enters a phone number, taps Send OTP. The app tries to reach the server. DNS lookup fails. The app shows a network error — the same error you'd see if your phone had no internet. The tester would check their WiFi, maybe restart the app. Nobody would think to check a line of code.
- **D2, D3:** Both unreachable because login can't complete without a working server.
- **D6 (New Visit):** This one is the most dangerous. The app is built offline-first, meaning it saves data locally before talking to the server. A new visit would appear to save successfully — it would show up on screen, no error. But the sync to the server would silently fail forever. The test would look like a PASS. The data would never reach the backend. A false green result is worse than a clear failure.

The fix was one line of code. But the gap it points to is structural: **fixing one handoff problem created a new handoff boundary.** Before, the gap was between QA and device testing — nobody owned "does the backend exist?" After adding the Backend Agent, the gap moved to the seam between the Backend Agent completing its work and the frontend being reconnected to it. Two agents, two separate sessions, no bridge between them.

---

---

## The Hardest Bug: Thirteen Sessions to Save One Visit

> *This one deserves its own section. It took longer to resolve than all three infrastructure failures combined.*

After the backend was live and device testing was unblocked, we moved on to D3 — the Patient Detail screen — and its connected screen D6, where doctors create new visit records.

The test was simple: create a visit, log out, log back in, confirm the visit is still there.

**It took thirteen device test sessions over two weeks to make that work.**

Each session followed the same rhythm: a Builder Agent session to apply a fix, a Device Tester session to verify it. Each time, the fix worked — and then a new failure appeared underneath it.

Here is the full chain, in order:

**Session 9 — The network layer was broken.**
Every API call from the app was going through a security library (`pinnedFetch`) that is incompatible with Expo Go. All sync attempts failed silently. Visits were saved locally, retried five times by the sync worker, marked as permanently failed, and deleted at logout. No error message visible to the user. Data gone.

**Session 10 — The field names were wrong.**
With the network layer fixed, POST /sync finally reached the server — and the server rejected it. The payload was using camelCase field names (`visitDate`, `chiefComplaint`). The server expected snake_case (`visit_date`, `chief_complaint`). One sync operation processed, one operation-level error returned, visit never marked as synced.

**Session 11 — The visit was never even queued.**
With the field names corrected, a new problem surfaced: the visit wasn't making it into the sync queue at all. The code that enqueues the visit for upload was sitting inside a database transaction. SQLite transactions in Expo block any reads or writes from outside — including from the sync worker — until the transaction closes. The enqueue call was inside the transaction. The sync worker couldn't see the row until the transaction committed, at which point the sync trigger had already run and found nothing.

**Session 12 — The server rejected a boolean sent as a number.**
With the enqueue fixed, the visit finally reached the server. The server returned: *"expected boolean, received number."* Visit rejected. Data loss again.

This one is subtle enough to be worth explaining carefully.

SQLite has no boolean data type. When you store `true` in SQLite, it becomes `1`. When you store `false`, it becomes `0`. When you read it back, you get an integer — not a boolean.

The code had a safety net for this:

```js
freshPatient?.consent_granted ?? false
```

The `??` operator returns the right side if the left side is `null` or `undefined`. It never fires for `0` or `1` — those are valid values, not null. So the integer went straight into the sync payload. The server's schema validation, which expected a real JavaScript boolean (`true`/`false`), rejected the integer. Every visit, every time.

**The fix — one line:**

```js
Boolean(freshPatient?.consent_granted ?? false)
```

`Boolean(0)` returns `false`. `Boolean(1)` returns `true`. The type mismatch disappears.

Session 13: visit created, synced, doctor logged out, logged back in — **visit still there.**

---

### Why this one was so hard

The three infrastructure failures earlier in this article were each a single visible gap. Someone could have caught them with a checklist question: *"Does the backend exist? Does the frontend URL match? Can this library run in Expo Go?"*

This was different. **Each layer of the bug was invisible until the layer above it was fixed.** There was no way to see the field name mismatch until the network worked. No way to see the enqueue race until the field names were right. No way to see the boolean type error until the enqueue worked. Four independent failures, stacked, each one masking the next.

And the final fix — `Boolean()` — is the kind of thing that looks obvious in hindsight and nearly impossible to anticipate. SQLite returning integers for boolean columns is documented behavior. The `??` operator not firing for `0` is correct JavaScript. Both are working exactly as designed. The bug only exists at the boundary where they meet. No agent in the workflow is assigned to look at that boundary.

The lesson here is different from the infrastructure failures. Those were process gaps — things the workflow was supposed to do but didn't. This was a **compounding opacity problem**: the real failure was hidden three layers deep, and the only way to find it was to fix everything above it first.

The only fix for that kind of problem is what we were already doing — structured device testing with a real device, one verified step at a time, every session logged with what worked and what didn't. It's slow. It's frustrating. It's the only way.

---

Looking at these failures together, the same thing is happening each time — just wearing a different disguise.

**Pattern 1: A risk that was documented but never converted into a gate.**

The ssl-pinning issue was written down. It sat in a test plan note as "deferred." Nothing in the workflow prevented the next step from starting without resolving it. Documentation is not the same as a checkpoint.

**Pattern 2: An assumption that was invisible because it was never stated.**

The backend assumption — "there will be a live server when we test this" — was baked into the QA agent's verdict without being written down anywhere. You cannot check an assumption you cannot see. The fix is not to make agents smarter. It is to turn invisible assumptions into required fields that must be filled in before any agent can declare "done."

**Pattern 3: A correct fix that created a new gap at its own boundary.**

Every time a new agent is added to close a gap, a new handoff is created. The new handoff is a new potential gap. In this case, the Backend Agent correctly deployed the server — but the act of adding a new agent with a new session boundary meant there was now a new seam between "backend knows where it lives" and "frontend knows where to find it." Gaps don't disappear. They move.

---

## The Fixes That Came From All Three

We made six structural changes. Not workarounds. Changes that make it structurally harder for this class of failure to happen silently.

**1. QA test plans now require a Prerequisites section.**

Every QA test plan opens with a mandatory block:

```
TESTING PREREQUISITES:
- Backend URL: [live at <url> / local mock / NOT DEPLOYED]
- Backend status: [reachable — confirmed via curl / UNREACHABLE — device testing blocked]
- Test credentials: [how to obtain]
- Status: [READY TO TEST / BLOCKED — reason]
```

A screen cannot be marked "Ready for device testing" unless Status is `READY TO TEST`. If any prerequisite is unknown, the status must be `BLOCKED`. The assumption is no longer invisible — it is a required field.

**2. Device Testing is now a formal step with a mandatory pre-flight check.**

The original workflow had no defined device testing step. It was a vague "next thing" after QA. It is now Step 8, with its own rules: run a live curl check against the backend, confirm test credentials exist, confirm the test phone number or OTP bypass is documented. If any check fails, declare testing blocked and stop. Do not proceed.

**3. Backend Status is a permanent, visible field in the project state document.**

Every session opens by reading the project state. That file now has a Backend Status section at the top — not buried in notes. It shows the deployment URL, whether it resolves, and what the next action is. Nobody can start a device testing session and discover mid-test that the backend doesn't exist or that the URL is wrong.

**4. After backend deployment, reconnecting the frontend is an explicit required step.**

When the Backend Agent completes, the project state is updated with a "Next action" entry: *Builder Agent must verify the frontend BASE\_URL in **`apiClient.ts`** matches the deployed backend URL.* This step is required before device testing can begin. The seam between "backend deployed" and "frontend connected" is now a named, owned step — not a gap between two agents.

**5. PM Agent now owns infrastructure readiness, not just product readiness.**

The PM Agent's post-flow review now explicitly asks: *"Is the backend built and reachable? If not, device testing is blocked — state a plan."* The pre-launch review now has an infrastructure checklist. A flow is not "complete" if the infrastructure needed to test it isn't in place.

**6. "Unclear" is a hard stop, not a preamble.**

The AI had a rule: if you can't identify which agent and step applies, ask. In practice it would ask, then interpret the user's answer as permission to proceed. The rule is now explicit: asking is a pause, not a green light. The AI must wait for an explicit answer. Implied permission is not permission.

---

## What This Taught Me About Working With AI Agents

**Agents are only as aware as their inputs.**

An agent does what it is asked to do with the information it is given. The QA agent was given code. It reviewed the code thoroughly. It had no way of knowing the server that code called didn't exist — because it was never given that information and never asked to check. That is not an agent failure. It is a workflow design failure.

**Every "done" is only done relative to its unstated assumptions.**

When an agent says "ready for the next step," that verdict is conditional on things that were never written down. The fix is not to make agents smarter. It is to surface the assumptions and turn them into required fields. If you cannot mark "READY TO TEST" without filling in the backend URL and confirming it resolves, the assumption can no longer stay invisible.

**The gaps live between agents, not inside them.**

Every agent in this workflow performed well within its scope. The failures happened at the boundaries — between QA and testing, between backend deployment and frontend connection. Gaps don't sit inside any one agent's responsibility. That's exactly why they go unnoticed. Closing a gap requires either assigning explicit ownership to the boundary, or creating a new step whose only job is to verify the handoff was clean.

**Fixing a gap moves it — it doesn't eliminate it.**

This is the hardest one. When we added the Backend Agent to fix the "no backend" problem, we created a new seam. The new seam was between the Backend Agent's output (deployed server URL) and the frontend's hardcoded address. Adding structure creates boundaries, and boundaries are where things fall through. The answer is not to avoid adding structure. It is to treat every new boundary as a potential gap and assign someone to own the check.

**An agentic workflow needs to be audited the same way code does.**

We run a Security Agent on every screen. We run a QA Agent on every screen. We don't run anything that audits the workflow itself. These three failures were all workflow bugs, not code bugs. They didn't get caught because no agent was assigned to look for them. That is the next thing to fix.

---

## Where We Are Now

All three failures are resolved.

The backend is deployed and reachable. The frontend URL points to it. The pre-flight check passes. All 13 runnable D1 device tests are unblocked.

The workflow has six structural fixes in place. Every future QA test plan opens with a Prerequisites section. Every device testing session starts with a pre-flight check. Every backend deployment ends with an explicit step to reconnect the frontend.

The tests that couldn't be run can now be run. And the next time a new agent is added to close a gap, we will immediately ask: what new boundary does this create, and who owns the check at that boundary?

---

*Building MedRecord in public. Offline-first healthcare records for Indian clinics. The interesting problems are never the ones you plan for.*

*If you're building with agentic AI and want to compare notes on what breaks and what doesn't — I'm interested in the conversation.*
