# Project State — MedRecord
_This file is updated at the end of every Claude Code session. Pass this file as context at the start of every new session._

## Current Status
**Phase:** Mockup in progress (D2 built, pending persona review)
**Last Updated:** 2026-02-19
**Last Session:** D2 Patient Search static mockup built — three states (empty, has-data, offline)

---

## Decisions Made (Locked — Do Not Revisit Without Good Reason)

| Decision | Rationale |
|---|---|
| Mobile number is primary patient key | Simpler than Aadhaar, lower regulatory risk, higher coverage |
| Aadhaar stored as SHA-256 hash only | UIDAI compliance, data minimisation |
| Visit-triggered, append-only records | No simultaneous writes possible; simplifies sync |
| Last-write-wins sync (no CRDTs) | Sufficient given write model; avoids complexity |
| expo-sqlite directly (not WatermelonDB) | Less abstraction, easier to debug in field for v1 |
| Zustand + React Query for state | Proven pattern for offline-first RN apps |
| AWS ap-south-1 (Mumbai) for all storage | DPDP data localisation expectation |
| OCR is async, never blocks UI | Core UX principle — speed > features |
| Google Vision API (primary), Tesseract (fallback) | Vision API better accuracy on handwriting |
| S3 image storage deferred to v2 — images stored on device local filesystem only for now. Swap requires changing one storage handler function and one config value. | — |
| D7 (Document Scanner) defaults to manual tap-to-capture; auto-capture deferred to v2 | Auto-capture is unreliable on low-end Android under inconsistent clinic lighting |
| D5 (New Patient Form) must hash Aadhaar at the form submission boundary — raw Aadhaar must never travel through the call stack or reach any storage layer | UIDAI compliance; data minimisation; extends existing SHA-256 hash decision |

---

## Build Constraints — Doctor Visit Flow (D2, D5, D6, D7)
_Carry these into every build/mockup session for these screens._

- **D2 (Patient Search):** Offline SQLite search is the primary implementation path, not a fallback. Write the SQLite path first. The network path layers on top. Show offline state variant as a first-class design state.
- **D6 (New Visit):** Must include an explicit "consent not yet established" state variant in the mockup. Do not build D6 as if patient consent is always pre-granted — D9 (Consent Request Flow) will wire up later, but D6 must acknowledge the state exists.
- **D6 (New Visit):** Validate against the product-vision.md success metric: doctor completes a visit record in under 60 seconds. If the screen requires more than 3 taps to reach a submittable state, redesign before persona review.
- **D7 (Document Scanner):** Include a simple exposure/readability indicator before capture (e.g. too dark / good / overexposed). Do not rely on OCR feedback — this is basic camera exposure feedback only. Required for inconsistent clinic lighting conditions.

---

## Screens Built

| Screen | File | Session | Notes |
|---|---|---|---|
| D2 — Patient Search / Home | `mockups/D2PatientSearchScreen.tsx` | 2026-02-19 | Static mockup; three states: empty, has-data, offline. Awaiting persona review. |

## Screens Pending
All screens from screen-inventory.md

---

## Open Questions
_None currently — add here as they arise during development._

---

## Known Technical Debt
_None yet._

---

## Rejected Ideas (Do Not Re-Propose)
| Idea | Why Rejected |
|---|---|
| Voice-based input for doctors | Core product principle: avoid new habits for doctors |
| Multi-doctor simultaneous edit | Structurally impossible given visit model; unnecessary complexity |
| Appointment scheduling in v1 | Out of scope; adds complexity without core value |
| Password-based auth | OTP is lower friction and reduces credential theft surface |
| Multi-staff concurrent editing | Out of scope. Visits are sequential append-only containers. A visit is owned by the opening doctor; staff can attach scans as separate record entries but cannot edit doctor notes. No locking mechanism needed — in practice, staff act sequentially on one device, not simultaneously. |

---

## GitHub Repository

**Repo URL:** https://github.com/rdevarakond88/medrecord
**Primary branch:** `main`
**Branch strategy:**
- `main` — stable, reviewed code only
- `dev` — active development; all Claude Code sessions commit here
- Feature branches named: `feature/screen-d2-patient-search`, `feature/sync-queue`, etc.

**Commit convention:**
```
[screen/feature] short description

e.g.
[D2] Add patient search screen mockup
[sync] Implement offline queue processor
[security] Add consent check to visit endpoint
[docs] Update project-state after D2 approval
```

**What gets committed:**
- All `/docs` markdown files (always up to date)
- All `/agents` markdown files
- All source code
- `project-state.md` updated at end of every session

**What never gets committed:**
- `.env` files (secrets, API keys)
- `node_modules`
- Build artifacts (`/dist`, `/.expo`)
- Any file containing real patient data

---

## Environment Setup Notes
_To be filled in when development starts._

## Dependency Versions
_To be filled in when development starts._
