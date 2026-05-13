# Persona Critique — Full Scan View (D8)
_Date: 2026-05-12 | Critic: Persona Critic Agent_

---

## DR. RAMAKANT SINHA (Reluctant Doctor)
**Score: 3/5**

**First impression:** Big dark screen with the document front and center. Clean. Not overwhelming. He'd understand what he's looking at immediately.

**Would be confused by:** The bottom panel — he won't know it can collapse or that the pill handle is the toggle. The label "Extracted Text" is an app term, not a paper term. Most critically: there's no patient name on screen. He opened this from a visit, but if he's distracted and looks back, he can't tell whose record he's viewing without hitting back.

**Would like:** The full-image view. Sees the real prescription, not a summary. Fewer things to interpret than he feared.

**Change requests:**
- Add patient name to the header (sub-line under the document label). He thinks in "whose chart is this" not "which screen am I on."
- Make "Pinch to zoom" hint legible — rgba(255,255,255,0.3) is invisible to a 58-year-old in a bright clinic.
- If OCR extraction fails, tell him what to do — "Read the image directly" is not an action, it's a shrug.

**Rubric scores:**
| Criterion | Weight | Score |
|---|---|---|
| Speed to complete task | 30% | 4 |
| Visual clarity / no clutter | 25% | 4 |
| Familiarity (feels like paper) | 20% | 3 |
| Feature richness | 10% | 2 |
| Discoverability of features | 15% | 2 |

**Weighted: 3.30**

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)
**Score: 4/5**

**First impression:** Solid image viewer. Status badges are well-done — she reads "Text extracted ✓" and immediately knows she can trust the OCR. Selectable OCR text is a good call; she'll copy medication names.

**Would be confused by:** Nothing material. She'll find the panel toggle instantly.

**Would like:** The four variants are all well-handled. The pending spinner correctly shows async status. The badge color-coding matches her expectations.

**Change requests:**
- Share button — she sends scans to colleagues and patients via WhatsApp. Spec says "optional v1" but she'll notice the absence on first use.
- No zoom control (+/- buttons) for one-handed use alongside OCR reading.
- Patient name missing from header — she works at a 3-doctor clinic and opens multiple records in quick succession.

**Rubric scores:**
| Criterion | Weight | Score |
|---|---|---|
| Speed to complete task | 30% | 4 |
| Visual clarity / no clutter | 25% | 4 |
| Familiarity (feels like paper) | 20% | 4 |
| Feature richness | 10% | 2 |
| Discoverability of features | 15% | 4 |

**Weighted: 3.80**

---

## SUNITA (Balancer / Staff)
**Score: 3/5**

**First impression:** Good. The "Text extracted ✓" badge tells her the scan worked. The image area is large and clear.

**Would be confused by:** The failed state. "Image only — text not extracted" tells her the what, not the what-next. She needs to know if she should rescan. "Not extracted" badge in red looks alarming — she'd worry she broke something.

**Would like:** The collapsed variant — she uses this to hand the phone to the doctor quickly. The full-image mode is practical for that handoff.

**Change requests:**
- No recovery path on OCR failed/deferred: add a "Rescan" link or note "Ask staff to rescan for better results." Without it, failed state is a dead end.
- Patient name in header — she's tracking multiple patients through the workflow.
- Red badge on "Not extracted" reads as an error she caused. Consider amber + softer copy: "Text not available."

**Rubric scores:**
| Criterion | Weight | Score |
|---|---|---|
| Speed to complete task | 30% | 4 |
| Visual clarity / no clutter | 25% | 4 |
| Familiarity (feels like paper) | 20% | 3 |
| Feature richness | 10% | 2 |
| Discoverability of features | 15% | 3 |

**Weighted: 3.45**

---

## SHANTABAI KADAM (Elderly Patient)
**Score: 2/5**

**Context:** D8 is doctor-facing, but in clinic the doctor may hand the phone to Shantabai so she can see her own prescription scan. Evaluating that scenario.

**First impression:** Dark background is slightly alarming. She sees the document stub and recognizes it — that reassures her. Then she sees small grey text below: "Extracted Text / Text extracted ✓." She has no idea what that means.

**Would be confused by:** The 13pt monospace OCR text is too small and tightly spaced for someone with age-related near vision changes. The pill handle is invisible to her. She'd stare at the screen without knowing she can swipe up or tap the strip. "Pinch to zoom" at rgba 30% opacity is literally invisible in bright light.

**Would like:** Seeing the actual prescription image — she recognizes her doctor's handwriting. That's enough for her.

**Change requests:**
- OCR text font must be at minimum 15pt; 13pt monospace in a small panel is inaccessible for elderly users.
- "Extracted Text" → something like "Scan Text" or remove the label entirely.
- "Pinch to zoom" hint needs to be at least rgba 60% — in a sunlit clinic it disappears at 30%.

**Rubric scores:**
| Criterion | Weight | Score |
|---|---|---|
| Speed to complete task | 30% | 3 |
| Visual clarity / no clutter | 25% | 3 |
| Familiarity (feels like paper) | 20% | 3 |
| Feature richness | 10% | 1 |
| Discoverability of features | 15% | 1 |

**Weighted: 2.50**

---

## ARJUN MEHTA (Semi-Savvy Patient)
**Score: 3/5**

**Context:** Evaluating as someone who might encounter a P3 equivalent built from this design pattern.

**First impression:** Recognizes the pattern — it's a document viewer like he's seen in banking apps. The OCR panel is a nice bonus.

**Would be confused by:** "Extracted Text" label — "Scan Text" is clearer. The pending state: how long does "Processing…" take? No ETA or retry affordance.

**Would like:** Selectable OCR text — he can WhatsApp the medication list to a family member. The status badges match his app literacy.

**Change requests:**
- Pending state needs an estimated wait or a "Check back" message — open-ended spinner creates anxiety.
- Minor: "Extracted Text" → "Scan Text" is more natural.

**Rubric scores:**
| Criterion | Weight | Score |
|---|---|---|
| Speed to complete task | 30% | 4 |
| Visual clarity / no clutter | 25% | 4 |
| Familiarity (feels like paper) | 20% | 4 |
| Feature richness | 10% | 2 |
| Discoverability of features | 15% | 3 |

**Weighted: 3.65**

---

## WEIGHTED AVERAGE: 3.3/5
_(Below the 3.5 threshold — revision required)_

**Criterion averages across all personas:**
| Criterion | Weight | Avg Score | Contribution |
|---|---|---|---|
| Speed to complete task | 30% | 3.8 | 1.14 |
| Visual clarity / no clutter | 25% | 3.8 | 0.95 |
| Familiarity (feels like paper) | 20% | 3.4 | 0.68 |
| Feature richness | 10% | 1.8 | 0.18 |
| Discoverability of features | 15% | 2.6 | 0.39 |
| **TOTAL** | | | **3.34** |

---

## MUST FIX

- **Patient name missing from header** — flagged by Sinha, Nair, Sunita. The nav param `patientName` is defined in the entry-point comment but never rendered in any variant. In a busy clinic, a doctor interrupted mid-session cannot tell whose scan they're viewing without navigating back. Add as a dimmed sub-line under the document label in `ScanHeader`.

- **OCR text font size too small (13pt monospace)** — flagged by Shantabai (primary trigger: score ≤ 2). Bump to minimum 14pt; 15pt preferred. Switching to system font at 14–15pt would also improve readability. The 13pt monospace in a 180px-tall panel is inaccessible for elderly users and anyone in bright clinic lighting.

---

## SHOULD FIX

- **No recovery path on OCR failed/deferred state** — flagged by Sunita, Sinha. Add a note in the failed body: "Ask staff to rescan if text is needed." Removes the dead-end feeling without requiring a new screen or navigation change.

- **"Extracted Text" label is too technical** — flagged by Sinha, Shantabai, Arjun. Replace with "Scan Text" or "Document Text." Small copy change; large clarity gain for non-technical users.

- **"Pinch to zoom" hint opacity too low (rgba 30%)** — flagged by Sinha, Shantabai. Raise to rgba(255,255,255,0.6) minimum — invisible in sunlit clinic conditions.

- **Pending state has no time expectation** — flagged by Arjun. Add "(usually under a minute)" or similar so the spinner doesn't feel infinite.

---

## NICE TO HAVE

- **Share action (WhatsApp / system share sheet)** — flagged by Nair, Sinha. Spec marks as optional v1. Note for Builder: the `headerRight` slot (currently an empty 40pt spacer) is the correct placement for a share icon when wiring.

- **Panel expandable beyond maxHeight: 280** — for dense prescriptions the 180px OCR scroll area is tight. Consider a "View full text" expand gesture in the wire session.

---

## BALANCER VERDICT: Revise and re-evaluate

**Rationale:** The core layout is correct — full-screen image with collapsible OCR panel is the right pattern for this screen, and all four state variants are complete. The two MUST FIX items are small changes (one JSX line for patient name; one style property for font size) that the Builder can apply quickly to the mockup before the wire session. The SHOULD FIX items — recovery path copy, label rename, hint opacity, pending copy — are all single-line changes. No structural redesign needed. Re-evaluate after fixes are applied to the mockup, then proceed to wire session.
