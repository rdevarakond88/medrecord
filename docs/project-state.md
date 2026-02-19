# Project State — MedRecord
_This file is updated at the end of every Claude Code session. Pass this file as context at the start of every new session._

## Current Status
**Phase:** Pre-development (documentation complete, mockups not started)
**Last Updated:** —
**Last Session:** —

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

---

## Screens Built
_None yet._

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

**Repo URL:** _(fill in once created — e.g. https://github.com/your-username/medrecord)_
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
