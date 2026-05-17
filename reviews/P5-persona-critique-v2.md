# Persona Critique — Patient Profile (P5) — v2 Re-evaluation

**Date:** 2026-05-16
**Mockup file:** `src/screens/patient/PatientProfileScreen.tsx`
**Verdict:** Ship as-is

---

## Fixes verified before re-evaluation

| ID | Item | Status |
|---|---|---|
| P5-PC-M1 | `keyboardType="default"` + auto-insert "/" after 2nd and 4th digit (lines 354–368, 365) | ✅ Confirmed |
| P5-PC-S1 | `LANGUAGE_NATIVE` map (lines 68–75); bilingual labels rendered in modal (line 199) and picker row (line 395) | ✅ Confirmed |
| P5-PC-S2 | `textSizeNote.fontSize: 14` (line 744) | ✅ Confirmed |
| P5-PC-S3 | `infoHint.fontSize: 13` (line 673), `editHint.fontSize: 13` (line 700) | ✅ Confirmed |

---

## DR. RAMAKANT SINHA (Reluctant Doctor)

**Score: 3.0/5**

**First impression:** "Same screen as before. Name, number, birthday, a language setting. Logout at the bottom. An Edit button at the top right. I could still walk any patient through this in thirty seconds."

**Would be confused by:** Nothing. This is not his screen and nothing on it creates friction for him.

**Would like:** The same simplicity as before — no new menus, no hidden paths.

**Change request:** None.

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)

**Score: 3.7/5**

**First impression:** "The DOB field now auto-inserts slashes as you type — that's the right fix for a DD/MM/YYYY format field. The language picker now shows 'Hindi — हिन्दी', etc. — a small touch that shows the team thought about non-English speakers."

**Would be confused by:** The Language row in view mode still shows just "Hindi" (the English key), not the bilingual label. Minor cosmetic gap — the modal (where selection happens) is correct, but the viewing state is inconsistent. Also, still no hint under the Language row explaining what changing it actually does.

**Would like:** The DOB auto-format is cleaner UX than a raw number-pad. The bilingual modal options are good.

**Change request:** (Nice to have) Show `LANGUAGE_NATIVE` label in view-mode InfoRow, not just the English key. Add "Sets the display language for this app" sub-hint under Language row.

---

## SUNITA (Balancer / Staff)

**Score: 4.0/5**

**First impression:** "The DOB field is fixed. I tried it in my head — type '14', get '14/', type '03', get '14/03/', type '1988', get '14/03/1988'. That's exactly what I needed. I can now hand the phone to Shantabai and walk away."

**Would be confused by:** Nothing blocking. The auto-slash behaviour may confuse a user who tries to backspace mid-field and sees a slash disappear and reappear — but this is a known trade-off of all DOB auto-format fields and not unique to this implementation.

**Would like:** The language modal with bilingual labels — patients can now self-identify their language without asking staff.

**Change request:** None required.

---

## SHANTABAI (Elderly Patient)

**Score: 3.5/5**

**First impression:** "My name and number at the top, in a circle. I understand this screen immediately. When I tap Edit, I see my name and my birthday in a box. I can change them."

**Would be confused by:**
1. "Controlled by your device's Display settings" — still opaque. She does not know where "Display settings" is. If she wants bigger text, this line gives her no actionable path.
2. Marathi is still absent from the language list. Of the 6 languages, she is from Maharashtra but cannot see Marathi (मराठी). She might select Hindi as a substitute, or leave it as English not knowing what to choose.
3. View mode shows "Language: Hindi" (English-only) — minor, since she already knows she picked Hindi, but inconsistent with the bilingual modal.

**Would like:** The clean view mode with large name display. The DOB edit field no longer frustrates her — she types digits and slashes appear. The language modal showing "Hindi — हिन्दी" means she can now identify her language independently, without help from staff.

**Change request:** Replace "Controlled by your device's Display settings" with actionable text — "To increase text size, go to your phone's Settings → Display." (Nice to have.)

---

## ARJUN (Semi-Savvy Patient)

**Score: 4.0/5**

**First impression:** "Same familiar profile layout. DOB field — I try typing '14031988' and I get '14/03/1988' automatically. That's exactly what I'd expect from a modern app. The language picker with native script labels is a small touch I didn't expect and appreciate."

**Would be confused by:** Nothing blocking. The auto-slash logic is intuitive for him; he uses PhonePe and similar apps that do the same for card expiry dates.

**Would like:** The bilingual language modal. Clean, minimal layout. Standard patterns throughout.

**Change request:** A hint under Language explaining what it does would close the last ambiguity. (Nice to have.)

---

## WEIGHTED AVERAGE: 3.64 / 5

_(3.0 + 3.7 + 4.0 + 3.5 + 4.0 = 18.2 ÷ 5)_

---

## MUST FIX

— None.

---

## SHOULD FIX

— None remaining. All 4 items from v1 (P5-PC-M1, P5-PC-S1, P5-PC-S2, P5-PC-S3) confirmed resolved.

---

## NICE TO HAVE

- View-mode Language row shows English-only key ("Hindi") rather than bilingual label ("Hindi — हिन्दी") — cosmetic inconsistency with the modal fix. Low priority. — Dr. Nair, Shantabai.
- Add sub-hint under Language row: "Sets the display language for this app." — Dr. Nair, Arjun.
- "Controlled by your device's Display settings" is opaque for elderly users. Replace with "To increase text size, go to your phone's Settings → Display." — Shantabai.
- Marathi (मराठी) absent from the 6-language list despite being the primary language of Maharashtra (83M speakers). Flag for PM v2 scope decision. — Shantabai.

---

## BALANCER VERDICT: Ship as-is

**Rationale:** All MUST FIX and SHOULD FIX items from v1 are resolved. The DOB field now auto-inserts slashes on any keyboard — the core usability blocker is closed. Native script labels in the language modal mean non-English-reading patients can self-identify their language without staff assistance. Font sizes meet the 14px minimum for informational text and 13px for hints. The remaining items are nice-to-haves (language hint copy, Marathi inclusion, view-mode label consistency) appropriate for a v1.1 pass, not blockers to advancing to the wire step.
