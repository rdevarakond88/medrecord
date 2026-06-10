# MedRecord

> A multi-agent mobile app for offline-first patient health records — built with Claude Code, React Native, and a 7-agent orchestration pipeline.

---

## What It Does

MedRecord is a mobile application designed for semi-urban Indian clinics. It enables doctors to record, store, and manage patient health records in an **offline-first** environment — meaning the app works fully even when internet connectivity is poor or intermittent.

Key capabilities:
- **Patient search** by mobile number — fast lookup in high-volume clinic settings
- **Visit history** — full clinical record with consent-gated access across doctors
- **New visit documentation** — structured data entry designed for under 60 seconds per visit
- **Consent flow** — patients grant or revoke access to their records (compliant with India's DPDP Act)
- **Auto-sync** — visit data queued locally and synced automatically when connectivity resumes

---

## Problems It Solves

| Problem | Solution |
|---|---|
| Unreliable internet in rural/semi-urban clinics | Offline-first local storage with sync queue |
| Paper-based records — slow and error-prone | Digital entry optimized for under 60 seconds per visit |
| PII exposure on shared clinic devices | Consent-gated data scoping + auth-layer enforcement |
| Cross-doctor data leakage | IDOR-resistant architecture; strict patient ownership model |
| DPDP Act compliance | Consent flow with explicit grant/revoke per doctor |

---

## Agent Architecture

This project was built using a **7-agent orchestration pipeline** running in Claude Code. Each screen goes through every agent in sequence before being committed.

```
FLOW LEVEL
  PM Agent — validates flow, conducts pre-flight and post-flow reviews

SCREEN LEVEL (per screen)
  Builder Agent      — builds mockup, applies fixes, wires API/SQLite
  Persona Critic     — evaluates screen from 5 user perspectives (scored)
  Security Agent     — audits for PII exposure, IDOR, consent gaps
  QA Agent           — creates test plan, analyzes edge cases
  Backend Agent      — implements and deploys endpoints from api-contracts.md
  Integration Tester — validates full connected loop across screens
```

Every step runs in a **fresh Claude Code session** to prevent context overload. Session scope, agent handoff rules, and build mistakes are documented in `AGENT_ORCHESTRATION.md` and `LESSONS-AND-RUNBOOK.md`.

---

## Screen Flows

- **D2 — Patient Search / Home**: Entry point; doctors search by mobile number
- **D3 — Patient Detail / History**: Full record view, consent status management
- **D6 — New Visit**: Clinical notes capture, offline queue, auto-sync on reconnect
- **D9 / P4 — Consent Flow**: Doctor requests access; patient grants or revokes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo SDK 54 |
| Language | TypeScript |
| Local Storage | expo-sqlite (async, transactional) |
| State | Zustand (global) + TanStack Query (server) |
| Navigation | React Navigation native-stack |
| Networking | Axios/Fetch + ngrok (dev tunnel) |
| Offline Sync | sync_queue with netinfo connectivity detection |
| Auth | expo-crypto (randomUUID), session-scoped access |

---

## Key Lessons Learned

**1. Human oversight is mandatory in agentic workflows**
Agents execute within scope precisely — but miss high-level product completeness (e.g., sign-up flows, recovery paths, retention policy design). A PM-layer review at flow start and end is non-negotiable.

**2. Real-device testing is not optional**
Simulators and web previews will not surface native keyboard behavior, touch target sizing, or contrast errors. These only appear on physical devices.

**3. Security must be enforced at the data layer**
Visual hiding (CSS opacity) is not security. Sensitive data must be stripped before it reaches components — not after.

**4. Integration testing is a separate discipline**
Individual screen success does not guarantee system success. Cross-flow scenarios (doctor requests consent → patient grants → doctor view updates) must be tested as connected experiences, not isolated units.

---

## Repository Structure

```
medrecord/
├── agents/                  # Agent prompt specs per role
├── backend/                 # API endpoints, Prisma schema, deploy config
├── src/                     # React Native screens and components
├── docs/                    # Project state, API contracts, UX specs
├── mockups/                 # Screen mockup files
├── AGENT_ORCHESTRATION.md   # Full agent pipeline and sequencing guide
├── CLAUDE.md                # Claude Code session instructions
├── LESSONS-AND-RUNBOOK.md   # Build mistakes, environment fixes, runbook
└── START-DEV.md             # Local dev setup and startup commands
```

---

## Status

354 commits · 18 deployments · Active development

Built by [Rajesh Devarakonda](https://www.linkedin.com/in/rajesh-d-1507021a5/) — AI Workflow Architect and TPM building agentic systems with Claude Code.
