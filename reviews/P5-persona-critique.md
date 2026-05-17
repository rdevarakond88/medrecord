# Persona Critique — Patient Profile (P5)

**Date:** 2026-05-16
**Mockup file:** `src/screens/patient/PatientProfileScreen.tsx`
**Verdict:** Revise and re-evaluate

---

## DR. RAMAKANT SINHA (Reluctant Doctor)

**Score: 3.0/5**

**First impression:** "This is the patient's personal page. Simple enough — their name, phone number, date of birth. An Edit button at the top. Logout at the bottom. I could explain this to any of my patients in thirty seconds."

**Would be confused by:** Nothing on this screen troubles him directly. He might wonder what "Language" actually changes (does the app switch to Hindi?), but this is not his screen.

**Would like:** The simplicity. No cluttered menus, no hidden settings.

**Change request:** None from his perspective.

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)

**Score: 3.5/5**

**First impression:** "Standard profile page. I've seen this pattern in every consumer app — it works. The avatar initials are a nice personal touch."

**Would be confused by:** The Language row shows "English" but there's no description of what changing it does. Does it switch the app UI? Notifications? Both? As a tech-savvy user she infers correctly, but the hint is missing.

**Would like:** Clean layout. Edit/Save toggle in the header is familiar. Logout confirmation alert is appropriately cautious.

**Change request:** Add a one-line hint under "Language" — "Sets the display language for this app." Not blocking, just cleaner.

---

## SUNITA (Balancer / Staff)

**Score: 3.0/5**

**First impression:** "This is where the patient manages their details. The Edit button is in the top right — I'd have to point that out for older patients who won't notice it immediately."

**Would be confused by:** The Date of Birth edit field. The placeholder says "DD/MM/YYYY" and the keyboard is `number-pad` (digits only). The "/" character does not appear on a number-pad keyboard on iOS. If Shantabai or another elderly patient tries to enter her date of birth, she'll get digits with no way to type the required slashes. I'll have to manually guide her or she'll give up.

**Would like:** A date picker (native OS picker) would remove this confusion entirely. At minimum, auto-insert "/" after the 2nd and 4th digit so users never need to type it.

**Change request:** Fix DOB keyboard — this will cause real support friction at the reception desk.

---

## SHANTABAI (Elderly Patient)

**Score: 2.5/5**

**First impression:** "My name and my number at the top, in a circle. That feels personal and reassuring. I can see my name, my phone, my birthday. The sections are clearly labelled."

**Would be confused by:**
1. Date of Birth editing — if she taps Edit and tries to change her birthday, she gets a number keyboard with no "/" key. The format requires "14/03/1988" but she cannot type the slashes. She would not understand why the entry looks wrong or what to do.
2. "Controlled by your device's Display settings" — she does not know what "Display settings" means. If she wants bigger text, she has no idea where to go.
3. Language modal shows "English", "Hindi", "Tamil", "Telugu", "Kannada", "Bengali" — all in Roman English script only. She might recognise "Hindi" in English letters, but "Kannada" or "Bengali" would mean nothing to her. She also doesn't see Marathi, which is her language.
4. `infoHint` ("Mobile number cannot be changed") and `editHint` ("Format: DD/MM/YYYY") render at 12px — very hard to read.

**Would like:** The clean, minimal layout in view mode. Big name at the top. Simple Logout button.

**Change request:** Fix date entry so slashes are handled automatically. Show language names in their own script. The text size note needs to be actionable, not just a pointer to a device menu she doesn't know exists.

---

## ARJUN (Semi-Savvy Patient)

**Score: 4.0/5**

**First impression:** "Familiar — this is like the profile page in PhonePe or most other apps I use. Name, number, DOB, language. Edit at the top. Logout at the bottom. I get it immediately."

**Would be confused by:** The DOB format requirement. He'll figure it out but the number-pad keyboard not showing "/" is a genuine friction point even for him. Also wondering if changing Language actually flips the app to Hindi.

**Would like:** The language modal slide-up — clean, large tap targets, checkmark on the selected language. Avatar initials are a nice touch.

**Change request:** Fix DOB input. Add a hint under Language explaining what it does.

---

## WEIGHTED AVERAGE: 3.2 / 5

_(3.0 + 3.5 + 3.0 + 2.5 + 4.0 = 16.0 ÷ 5)_

---

## MUST FIX

| ID | Item | Flagged by |
|---|---|---|
| P5-PC-M1 | `keyboardType="number-pad"` on the Date of Birth EditRow makes it impossible to type the "/" characters required by the "DD/MM/YYYY" format. iOS number-pad keyboards do not expose "/" — users can only type digits. This makes date editing non-functional for all patients. Fix: switch to `keyboardType="default"` with auto-insertion of "/" after the 2nd and 4th digit on input, OR use a native date picker. | Sunita, Shantabai, Arjun |

---

## SHOULD FIX

| ID | Item | Flagged by |
|---|---|---|
| P5-PC-S1 | Language options in the modal are displayed in English-only Roman script. A patient who does not read English cannot identify their language from this list. Display each option in both English and its own script: "Hindi — हिन्दी", "Tamil — தமிழ்", "Telugu — తెలుగు", "Kannada — ಕನ್ನಡ", "Bengali — বাংলা". English remains "English". | Shantabai |
| P5-PC-S2 | `textSizeNote` renders at 13px — below the 14px minimum established for informational text on patient screens (same issue as P4-PC-v2-S1). One-line fix: `fontSize: 13 → 14`. | Shantabai |
| P5-PC-S3 | `infoHint` and `editHint` render at 12px — too small for the elderly patient audience. Raise both to 13px minimum (14px preferred for full compliance with patient screen text standard). | Shantabai, Sunita |

---

## NICE TO HAVE

- Add a one-line sub-label under the Language row: "Sets the display language for this app." Helps non-power users understand what the setting controls. — Dr. Priya Nair, Arjun.
- "Controlled by your device's Display settings" is opaque for elderly patients. Consider replacing with: "To increase text size, go to your phone's Settings → Display." — Shantabai.
- Marathi is absent from the 6-language list despite being the primary language of Maharashtra clinics (83M speakers). Defer to PM for v1 scope decision, but flag as a notable gap for the target clinic geography. — Shantabai.

---

## BALANCER VERDICT: Revise and re-evaluate

**Rationale:** The DOB input has a concrete usability bug — `keyboardType="number-pad"` blocks "/" entry while the format requires it, making date editing non-functional. This must be fixed before moving to wire. Applying P5-PC-S1 (native script in language modal) and P5-PC-S2/S3 (12–13px text to 14px minimum) alongside the DOB fix will bring the screen to a shippable state. No structural redesign is needed — the layout and flow are sound.
