# UI/UX Specification — MedRecord

## Design System

### Typography
- Font: Inter (system fallback: sans-serif)
- Base size: 16px
- Scale: 12 / 14 / 16 / 18 / 22 / 28 / 36
- Headings: Semibold (600); Body: Regular (400); Labels: Medium (500)

### Colour Palette
```
Primary Blue:    #1A6DB5   (CTAs, active states, links)
Primary Dark:    #0F4880   (headers, emphasis)
Surface:         #FFFFFF
Background:      #F5F7FA
Border:          #E2E8F0
Text Primary:    #1A202C
Text Secondary:  #64748B
Text Disabled:   #CBD5E0
Success:         #16A34A
Warning:         #D97706
Error:           #DC2626
Scan Orange:     #EA580C   (scan/camera CTA — warm, visible, distinct)
```

### Spacing
- Base unit: 4px
- Common: 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48

### Touch Targets
- Minimum: 48×48px (WCAG AA)
- Preferred for primary actions: 56×56px or full-width buttons

### Accessibility
- All text meets 4.5:1 contrast ratio minimum
- All interactive elements have accessible labels
- Support for system font size scaling up to 200%
- Bottom navigation labels always visible (never icon-only)

---

## Navigation Structure

### Doctor App
```
Bottom Tab Bar:
├── Patients      (search + recent)
├── Today         (visits opened today)
├── Scan          (quick scan entry point)
└── Profile       (settings, logout)
```

### Patient App
```
Bottom Tab Bar:
├── My Records    (timeline)
├── Doctors       (who has access)
└── Profile
```

---

## Screen Inventory — Doctor App

---

### D1: Login / OTP Screen

**Purpose:** Phone number entry + OTP verification

**Layout:**
- MedRecord logo (centered, top third)
- Subtitle: "For Doctors & Clinics"
- Phone number input (large, numeric keyboard)
- "Send OTP" primary button (full width)
- After OTP sent: 6-digit OTP input + "Verify" button
- Resend link (shows countdown: "Resend in 45s")

**Behaviour:**
- Auto-advance focus to OTP field after phone entry
- OTP auto-submits when 6th digit entered
- Error states: invalid number, wrong OTP, expired OTP

---

### D2: Patient Search / Home

**Purpose:** Doctor's primary entry point. Find a patient or start a new record.

**Layout:**
- Header: "Good morning, Dr. [Name]" + clinic name
- Large search bar: "Search by mobile number"
- Numeric keypad below search bar (no full keyboard — reduces friction)
- Recent patients list (last 5, with name + mobile + last visit date)
- FAB (+) in bottom right: "New Patient"

**Behaviour:**
- Typing phone number → live lookup → show match or "Not found"
- Tapping a recent patient → navigates to D3 (Patient Detail)
- "New Patient" → D5 (New Patient Form)
- Offline: Recent patients still accessible; search works on locally cached records

**Design Note:** The numeric keypad on-screen reduces friction vs. full keyboard. Doctors will type phone numbers frequently.

---

### D3: Patient Detail / History

**Purpose:** Full view of a patient's visit history. Launch point for new visit.

**Layout:**
- Header: Patient name + mobile + age (if available)
- Consent status badge (green: "Access Granted" / amber: "Pending Consent")
- Primary action button: "New Visit" (full width, blue)
- Visit list (newest first):
  - Each card: Date, chief complaint (if any), clinic name, record count
  - Tap to expand inline preview of first record
- Empty state: "No previous records. Start the first visit."

**Behaviour:**
- "New Visit" → D6 (New Visit)
- Tapping visit card → D4 (Visit Detail)
- If no consent: "New Visit" still available (creates implicit consent request); history grayed out

---

### D4: Visit Detail

**Purpose:** View all records within a single visit.

**Layout:**
- Header: Date, Doctor name, Clinic name
- Status badge: "Open" (amber) or "Submitted" (green)
- Records list:
  - Scan records: thumbnail + OCR text preview (2 lines) + "View Full" link
  - Note records: full text (collapsible if long)
- Bottom bar (if visit is Open):
  - "Add Scan" button + "Add Note" button
  - "Submit Visit" button (greyed out until at least one record exists)

**Behaviour:**
- Tapping scan thumbnail → D8 (Full Scan View)
- "Add Scan" → D7 (Camera/Scan)
- "Add Note" → inline text input slides up (no new screen)
- "Submit Visit" → confirmation dialog → marks visit as submitted (locked)

---

### D5: New Patient Form

**Purpose:** Register a patient who doesn't exist in the system yet.

**Layout:**
- Mobile number (pre-filled if searched from D2, non-editable)
- Name (optional, labeled "Optional")
- Date of Birth (optional, date picker)
- Gender (optional, 3-button toggle: M / F / Other)
- "Create Patient & Start Visit" — single primary button

**Behaviour:**
- Submitting creates patient + immediately opens D6 (New Visit)
- Offline: Patient created locally, queued for sync

**Design Note:** Everything except mobile is optional. This screen should take under 20 seconds to complete.

---

### D6: New Visit

**Purpose:** Open a visit and add at least one record.

**Layout:**
- Visit date: today's date shown prominently (tappable to change if needed)
- Chief complaint field (optional, placeholder: "Why did patient visit? (Optional)")
- Record entry zone (large, centre of screen):
  - Big orange camera button: "Scan a Document"
  - OR: Text note area with placeholder "Or type a note..."
  - One of these must be completed before submitting
- "Save Visit" button (disabled until at least one record added)

**Behaviour:**
- Camera button → D7 (Scan)
- Typing in note area activates "Save Visit"
- "Save Visit" → saves, returns to D3 with visit in list

**Design Note:** Two clear actions, one must be chosen. No ambiguity.

---

### D7: Document Scanner

**Purpose:** Camera capture of physical documents.

**Layout:**
- Full-screen camera view
- Document edge detection overlay (rectangle guide)
- Capture button (large, centred at bottom)
- "Use Photo Library" link (for existing photos)
- Flash toggle
- After capture: image preview with options:
  - "Use This" (primary)
  - "Retake" (secondary)
  - Crop handles on preview

**Behaviour:**
- After "Use This": image saved locally, OCR queued
- Returns to D6 or D4 with scan thumbnail added
- Offline: image stored locally, S3 upload queued, OCR will run after upload

**Design Note:** Guide overlay helps non-tech-savvy staff frame documents. Keep UI minimal during capture — nothing should distract.

---

### D8: Full Scan View

**Purpose:** Full-resolution view of a scanned document.

**Layout:**
- Full-screen zoomable image (pinch-to-zoom)
- Bottom sheet (collapsible):
  - "Extracted Text" tab: OCR output as plain text
  - OCR status indicator ("Text extracted" / "Extraction failed — view image" / "Processing...")
- Header: date + which visit it belongs to
- Share button (optional for v1)

---

### D9: Consent Request Flow

**Purpose:** Get patient consent in-clinic before sharing records.

**Layout:**
- Explanation card: "To view [Patient Name]'s history, they need to grant you access."
- Step 1: "Show this screen to the patient" — displays patient's mobile number + request details
- Step 2: Patient receives OTP on their phone
- OTP input for patient to enter (doctor hands phone to patient)
- "Grant Access" confirmation

**Behaviour:**
- On success: consent recorded, doctor gains access
- Doctor never sees the patient's OTP input (for privacy)

---

## Screen Inventory — Patient App

---

### P1: Login / OTP Screen
Same as D1 but subtitle: "For Patients"

---

### P2: My Records (Timeline)

**Purpose:** Patient's full medical history. Primary screen.

**Layout:**
- Header: "My Health Records"
- Filter bar: "All" / "By Doctor" / "By Clinic"
- Timeline list (newest first):
  - Section headers: Year (e.g., "2024")
  - Each entry: Date, Doctor name, Clinic name, visit summary
  - Scan thumbnail (if available)
  - Tap to expand: see full records for that visit
- Empty state: large friendly illustration + "Your health records will appear here after your first clinic visit."

**Design Note for Elderly Users:**
- Extra-large text option accessible from Profile
- No icons without labels
- High contrast mode
- Each record card is large enough to tap without precision

---

### P3: Visit Record Detail (Patient View)

**Purpose:** Read-only view of a single visit.

**Layout:**
- Date, Doctor name, Clinic name (prominent)
- Records list:
  - Scan: large thumbnail, tap to full view
  - Note: full text displayed
- "Something wrong?" link at bottom (opens a simple flag/report form for v2)

---

### P4: Doctors Who Have Access

**Purpose:** Consent management for patient.

**Layout:**
- List of doctors/clinics with active consent:
  - Doctor name, clinic, "Access since: [date]"
  - "Revoke Access" button (red, with confirmation)
- "New Request" section: any pending consent requests
- Empty state: "No doctors have access to your records yet."

---

### P5: Profile

**Purpose:** Patient settings.

**Layout:**
- Name (editable)
- Mobile number (non-editable)
- Date of Birth (editable)
- "Large Text Mode" toggle
- "Language" selector (Hindi, English, Tamil, Telugu, Kannada, Bengali for v1)
- Logout

---

## Offline State Indicators

**Global sync indicator** (top of screen, only visible when relevant):
- Syncing: thin blue progress bar at very top of screen (non-intrusive)
- Offline: small amber dot + "Offline — changes will sync when connected" banner
- Sync error: red banner with retry button

**Per-record indicators:**
- Unsynced scan: small cloud-with-arrow icon on thumbnail
- OCR pending: "Processing text..." label
- OCR failed: "Text extraction failed" — image still fully viewable

---

## Key Interaction Patterns

### Quick Add (Doctor)
The fastest path to a record must be:
1. Tap patient in recent list
2. Tap "New Visit"
3. Tap camera button
4. Capture
5. Tap "Use This"
6. Tap "Save Visit"
= 6 taps, zero typing, under 60 seconds

### First-Visit Patient (No Existing Record)
1. Type mobile number on D2
2. Tap "Not Found → Create New Patient"
3. Tap "Create Patient & Start Visit" (name optional — skip it)
4. Scan or note
5. Save
= Patient in system in under 90 seconds

---

## Localisation Notes

- All text strings externalised from day 1 (i18n-ready)
- Date format: DD/MM/YYYY (Indian standard)
- Currency: not applicable in v1
- Numbers: use Indian numeral system where applicable
- RTL: not needed for v1 languages but architecture should not block it
