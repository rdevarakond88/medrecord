# SECURITY AUDIT — D7 Document Scanner (Static Mockup)

_Auditor: agent-security.md_
_Date: 2026-03-04_
_Source file: `mockups/D7DocumentScannerScreen.tsx`_
_PM pre-flow review: `reviews/D7-pm-preflow.md`_
_Validation checklist: `reviews/D7-VALIDATION-CHECKLIST.md`_

---

## CRITICAL (must fix before merge)

### CRITICAL-1: Auth guard placed BEFORE hooks in 4 of 5 variants — React Rules of Hooks violation

**Affected variants:** `D7ViewfinderGood` (line 326), `D7ViewfinderTooDark` (line 437),
`D7ViewfinderOverexposed` (line 493), `D7PreviewState` (line 553)

**File:** `mockups/D7DocumentScannerScreen.tsx`, lines 326, 437, 493, 553

**What the mockup does:**
```tsx
// D7ViewfinderGood — lines 322–332 (same pattern in all four variants)
export function D7ViewfinderGood() {
  const token = MOCK_TOKEN;
  const user  = MOCK_USER;
  if (!token || !user) return null;   // ← EARLY RETURN HERE
  const [flashMode, setFlashMode] = useState<FlashMode>('off'); // ← HOOK after return
  const isCapturingRef = useRef(false);                         // ← HOOK after return
```

**Risk:**
React's Rules of Hooks require that hooks are called unconditionally on every render.
An early return placed before `useState` or `useRef` changes the number of hooks called
depending on whether the user is authenticated. When the live build replaces `MOCK_TOKEN`
and `MOCK_USER` with `useAuthStore()`, token expiry mid-session will cause React to call
a different number of hooks between renders, crashing the app with
`"Rendered more hooks than during the previous render"` or silently corrupting hook state.

This is the same pattern that caused D3-H-3 and required an explicit note in D3 build
constraints in `docs/project-state.md` ("Add synchronous auth guard after all hooks,
before JSX — same pattern as D2 live screen").

**Fix required:**
Move the auth guard to AFTER all hooks, before the `return (JSX)` statement, in all
four affected variants. The only safe position is after the last hook call:

```tsx
// CORRECT pattern — applies to all five variants
export function D7ViewfinderGood() {
  const { token, user } = useAuthStore();           // ← hook first
  const [flashMode, setFlashMode] = useState<FlashMode>('off'); // ← hook
  const isCapturingRef = useRef(false);             // ← hook
  // ... all other hooks ...

  if (!token || !user) return null;                 // ← AFTER all hooks, before JSX
  return ( ... );
}
```

`D7ProcessingState` (lines 640–643) has no hooks after the auth guard and is technically
safe, but must still follow the consistent pattern when the live build is written.

---

### CRITICAL-2: visitId not validated as non-null before scan is written to disk

**File:** `mockups/D7DocumentScannerScreen.tsx`, `D7PreviewState.handleUseThis` (line 558–572)

**What the mockup does:**
```tsx
const handleUseThis = async () => {
  if (isProcessingRef.current) return;
  isProcessingRef.current = true;
  try {
    const result = await mockUseThis('mock-raw-path.jpg', user.id);
    // navigation.navigate('NewVisit', { scan: result });
    console.log('[D7 mockup] Use This result:', result.label);
  } finally {
    isProcessingRef.current = false;
  }
};
```

There is no check that `visitId` is non-null before `mockUseThis` (image save + return
of `localPath`) is called. `visitId` is a nav param received from D6/D4. If it arrives
as `null` or `undefined` (navigation error, state reset, or D7 entered without a visit
context), the scan image will be saved to the doctor-scoped filesystem path with no visit
association in `visits_draft` or `enqueueOperation`. This creates:

1. A sensitive medical scan image on-device with no database row linking to it (orphaned file)
2. No cleanup path — the image survives logout unless the entire doctor directory is deleted
3. A scan that will never be synced to the server because there is no `visits_draft` row

**Risk:**
Orphaned sensitive medical image file. If scan includes identifiable health content
(lab report, discharge summary), it remains on device indefinitely with no audit trail.

Checklist item #64 requires this validation. The mockup must demonstrate the guard
pattern so the builder knows where to put it in the live screen.

**Fix required:**
Add `visitId` extraction from nav params and a non-null guard at the top of the component
before any capture or write logic proceeds. Pattern:
```tsx
// In live build — extract and validate nav params
const route = useRoute<DocumentScannerRouteProp>();
const { patientId, visitId } = route.params;

// ... hooks ...

if (!token || !user) return null;

// visitId guard — after auth, before capture is possible
if (!visitId) {
  // show error state and return to caller
  return <ErrorState message="No visit context — cannot attach scan." />;
}
```

The mockup must show this guard pattern even with placeholder data, so the live build
has a concrete implementation reference.

---

## HIGH (fix before v1 launch)

### HIGH-1: sanitizeOcrText() defined but never called — no demonstrated call site

**File:** `mockups/D7DocumentScannerScreen.tsx`, lines 135–139 (definition), entire file (no call site)

**What the mockup does:**
```tsx
// Function defined correctly at line 135
function sanitizeOcrText(rawText: string): string {
  return rawText
    .replace(/\d{4}\s\d{4}\s\d{4}/g, '[REDACTED]')
    .replace(/\d{12}/g, '[REDACTED]');
}
// ... 900 lines of component code with zero calls to sanitizeOcrText()
```

The function is defined and the regex logic is correct. However there is no call site
anywhere in the mockup. The implementation comments in `mockUseThis` (line 177) mention
it should be called "before any SQLite write" but provide no concrete invocation example.

**Risk:**
The builder has no concrete pattern to follow. When wiring up the OCR queue handler
in the live build, the Aadhaar strip step is easy to omit because there is no example
of where to insert it. If omitted, OCR output from government hospital discharge
summaries (which routinely print Aadhaar numbers) will be written to SQLite in plaintext.

This is PM REQ 2, a non-negotiable UIDAI compliance requirement, and a locked decision:
"Aadhaar stored as SHA-256 hash only." The mockup must demonstrate the call site.

**Fix required:**
Add a demonstrated call site in the OCR result handler stub. Even in the mockup (which
has no real OCR), add a stub function that shows the pattern:

```tsx
// In mockUseThis or a dedicated OCR queue stub:
async function queueOcrAsync(localPath: string, visitId: string): Promise<void> {
  // Real build: POST /ocr/queue — async, never awaited in capture flow
  // When result arrives, apply strip BEFORE any SQLite write:
  //   const rawOcrText: string = await fetchOcrResult(localPath);
  //   const safeText = sanitizeOcrText(rawOcrText);  // ← strip Aadhaar at write boundary
  //   await db.runAsync(
  //     'UPDATE visits_draft SET ocr_text = ? WHERE id = ?',
  //     [safeText, visitId]
  //   );
}
```

Without this, HIGH-1 will likely become a CRITICAL finding in the live screen security audit.

---

## MEDIUM (fix in next sprint)

### MEDIUM-1: console.log in D7PreviewState logs scan result — risky pattern for live build

**File:** `mockups/D7DocumentScannerScreen.tsx`, line 569

```tsx
console.log('[D7 mockup] Use This result:', result.label);
```

Currently `result.label` is `"Document – 04/03/2026"` — no PII. However, the label field
is caller-constructed in the live build and may include patient-identifying strings
(e.g., `"Lab Report – Sunita Patil – 04/03/2026"`). If this console.log is copied into
the live screen (as mockup code often is), it will log PII to the console in production.

consent-layer-spec.md Rule 1: "Never log patient mobile numbers or names in application logs."

**Fix:** Remove the `console.log` from the mockup entirely. Replace with a comment:
```tsx
// [D7 mockup] result: { localPath, label } — do not log in live build
```

### MEDIUM-2: mockUseThis uses Date.now() for filename — should use randomUUID()

**File:** `mockups/D7DocumentScannerScreen.tsx`, line 186

```tsx
const localPath = `file:///data/user/0/com.medrecord/${doctorId}/scans/scan-${Date.now()}.jpg`;
```

The PM REQ 1 implementation comment at line 155 explicitly states `Crypto.randomUUID()`:
```
const localPath = `${dir}${Crypto.randomUUID()}.jpg`;
```

Checklist item #51 requires non-predictable filenames via `expo-crypto` `randomUUID()`.
`Date.now()` produces a predictable sequential timestamp. On a shared clinic device,
a party with filesystem access who knows the approximate capture time can enumerate
scan file paths and access sensitive medical images.

**Fix:** Change the mock path to use a `randomUUID()` call:
```tsx
// PM REQ 1: non-predictable filename (expo-crypto in live build)
const mockUUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; // placeholder in mockup
const localPath = `file:///data/user/0/com.medrecord/${doctorId}/scans/${mockUUID}.jpg`;
```

This ensures the live build builder copies the correct pattern.

---

## LOW (track in backlog)

### LOW-1: D7ViewfinderTooDark and D7ViewfinderOverexposed modals missing accessibilityViewIsModal

**File:** `mockups/D7DocumentScannerScreen.tsx`, lines 478, 533

`D7ViewfinderGood` (line 420) includes `accessibilityViewIsModal` on its Modal. The other
two viewfinder variants omit it. In the live build, VoiceOver/TalkBack users navigating
during the preview modal will not have the modal container announced as a modal context.

**Fix:** Add `accessibilityViewIsModal` to both Modal declarations.

### LOW-2: sanitizeOcrText Aadhaar regex does not cover non-standard spacing variants

**File:** `mockups/D7DocumentScannerScreen.tsx`, line 137

```tsx
.replace(/\d{4}\s\d{4}\s\d{4}/g, '[REDACTED]') // matches single-space only
```

The PM pre-flow spec (D7-pm-preflow.md line 16) uses `\d{4}\s?\d{4}\s?\d{4}` (optional
space). The mockup uses `\d{4}\s\d{4}\s\d{4}` (requires exactly one space). Printed
Aadhaar with two spaces, tab, or non-breaking space would not be stripped by the spaced
regex (though the `\d{12}` fallback catches the no-space variant). Low risk for standard
government-printed cards.

**Fix:** Change to `\d{4}\s?\d{4}\s?\d{4}` to match the spec, or `\d{4}[\s\u00A0]*\d{4}[\s\u00A0]*\d{4}`
to cover non-breaking spaces.

---

## D7-Specific Area Results

| Area | Status | Notes |
|---|---|---|
| Auth guard position | ❌ CRITICAL | Wrong position in 4/5 variants — before hooks |
| doctorId sourced from auth store | ✅ Pass | `user.id` (auth store) passed to mockCapturePicture and mockUseThis — never from nav params |
| Aadhaar strip (sanitizeOcrText) | ⚠️ HIGH | Function defined and correct; no call site demonstrated |
| visitId non-null validation | ❌ CRITICAL | Not shown in mockup; orphaned scan risk |
| No PII in console.log | ⚠️ MEDIUM | `result.label` logged at line 569; risky pattern |
| Tap guard (useRef) | ✅ Pass | All capture/submit buttons use `useRef(false)` correctly |
| Modal mounting | ✅ Pass | All Modals mounted unconditionally; `visible` prop only |

---

## Checklist Status

```
⚠️  Authentication & Sessions  — N/A for server-side items; auth guard FAILED on mobile
❌  Authorisation              — 1/2 passed; auth guard wrong position; doctorId sourced correctly
⚠️  Data Handling              — 3/5 passed; sanitizeOcrText not called; console.log risk
✅  Mobile Security            — Tap guards correct; doctor-scoped path pattern correct
⚠️  Input Validation           — visitId null-check not demonstrated (CRITICAL-2)
✅  Database                   — No direct DB queries in this screen
✅  DPDP Compliance            — Doctor-scoped path + logout cleanup shown in comments/mock
```

**Detailed checklist (security-relevant items):**
- [✅] doctorId sourced from `user.id` (auth store), not nav params
- [✅] Tap guard: `useRef(false)` used on capture button and "Use This" — not `useState`
- [✅] Modal mounted unconditionally; `visible` prop controls visibility (Rule 7)
- [✅] No patient mobile number in any console.log call
- [✅] No patient name in any console.log call
- [✅] Doctor-scoped image directory pattern: `<docDir>/<doctorId>/scans/<uuid>.jpg`
- [✅] Logout directory cleanup pattern shown in comments (live build: `useLogout`)
- [❌] Auth guard: placed BEFORE hooks in 4/5 variants (CRITICAL-1)
- [❌] visitId validated non-null before scan write (CRITICAL-2)
- [❌] sanitizeOcrText() has no call site (HIGH-1)
- [⚠️] console.log logs scan result.label — risky in live build (MEDIUM-1)
- [⚠️] mockUseThis uses Date.now() not randomUUID() (MEDIUM-2)
- [⚠️] accessibilityViewIsModal missing from 2 Modal variants (LOW-1)

---

## OVERALL VERDICT: **BLOCKED — 2 CRITICAL issues**

D7 mockup may not proceed to live build with CRITICAL-1 and CRITICAL-2 unresolved.

**Required before build begins:**
1. Move auth guard to AFTER all hooks in all 5 variants (CRITICAL-1)
2. Add visitId non-null guard pattern in D7PreviewState (CRITICAL-2)
3. Add demonstrated sanitizeOcrText() call site (HIGH-1 — recommended to fix alongside CRITICAL items)

**Already correct (do not regress):**
- doctorId from auth store ✅
- Tap guard via useRef ✅
- Modal unconditional mount ✅
- Doctor-scoped path structure ✅
- Aadhaar regex logic (correct, just needs a call site) ✅
