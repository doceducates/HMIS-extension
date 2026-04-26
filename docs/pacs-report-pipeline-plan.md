# HMIS Extension — Bug Fixes + PACS/Report Pipeline

## Problem Summary

**Two bugs to fix:**
1. **Login loop** — When already logged in on another device, the login page shows an error but the extension keeps retrying infinitely
2. **Empty queue loop** — On `/token/today` with no patients, the extension re-runs department/role selection in an infinite cycle

**One major feature to add:**
- PACS study list integration + HMIS published report download pipeline

---

## Part 1: Bug Fixes

### Bug 1: Login Infinite Loop

**Root cause:** The content script runs `handleLogin()` every time `/login` loads. If login fails (e.g., "already logged in elsewhere" error banner), the page stays on `/login` and the script runs again on the next page load/navigation, creating an infinite loop.

**Fix:**
- Detect error messages on the login page (e.g., "already logged in", validation errors)
- Add a retry counter stored in `chrome.storage.session` — max 3 login attempts
- If error detected or max retries reached, stop automation and report to popup

#### [MODIFY] [login-handler.ts](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/modules/login-handler.ts)

- Check for error banners/alerts on the login page before attempting login
- Track login attempt count in session storage
- If attempts ≥ 3 or error detected → report error, stop trying
- Add detection for common HMIS error messages: "already logged in", "invalid credentials", "session expired"

#### [MODIFY] [selectors.ts](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/modules/selectors.ts)

- Add selectors for login error banners (`.alert-danger`, `.error-message`, etc.)

---

### Bug 2: Empty Queue → Department/Role Selection Loop

**Root cause:** The page `/token/today` contains the role-switcher element (`.login-roles-list`), so `detectPageContext()` returns `PATIENT_QUEUE` → triggers `handleRoleSelection()`. After the role switch, the page reloads, the script runs again, and if the role text doesn't match perfectly, it switches again. Even if the role IS correct, the content script runs `handleRoleSelection()` every load, and if the page has any dynamic behavior, this creates a cycle.

**Fix:**
- Add `/token` path detection in `detectPageContext()` — this should be `PATIENT_QUEUE` context
- Add a "setup completed" flag in `chrome.storage.session` to prevent re-running role selection after it succeeds
- When role is already correct, mark setup complete and stop
- Only re-run role selection if explicitly triggered from popup

#### [MODIFY] [content.ts](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/content.ts)

- Add `/token` to the `PATIENT_QUEUE` path detection
- Add session flag check: if `setupCompleted` is true for this tab, skip department/role handlers
- Set flag after successful role selection

#### [MODIFY] [department-handler.ts](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/modules/department-handler.ts)

- After successful role selection, store `setupCompleted: true` in session storage
- Check flag before running again

---

## Part 2: PACS Study List + Report Download Pipeline

> [!IMPORTANT]
> The existing Radiology Assistant backend (`lib/dicom/orthanc.ts`) already has full Orthanc/DICOM support including `findStudies()`, `getStudySeries()`, etc. The extension should **call the RadOS backend API** rather than implementing DICOM C-FIND directly (Chrome extensions can't make raw TCP/DICOM connections).

### Architecture

```
┌──────────────────┐     HTTP/REST      ┌──────────────────────────┐    DICOM C-FIND    ┌──────────┐
│  HMIS Extension  │ ──────────────────► │  RadOS Next.js Backend   │ ─────────────────► │  Orthanc │ ──► PACS
│  (Chrome Popup)  │ ◄────────────────── │  /api/dicom/studies      │ ◄───────────────── │  Server  │
└──────────────────┘     JSON response   └──────────────────────────┘                    └──────────┘

                                         HMIS Browser Tab
                                         ┌──────────────────────────┐
                                         │  Content Script          │
                                         │  - Switch to Radiology   │
                                         │  - Navigate to Reports   │
                                         │  - Enter Accession #     │
                                         │  - Download PDF          │
                                         └──────────────────────────┘
```

### Data Flow

1. Extension queries RadOS API → gets PACS study list (patient, accession, modality, date)
2. User can browse/search studies in the popup
3. User selects studies to fetch reports for
4. Extension automates HMIS:
   - Switch role to "Radiology PGR"
   - Navigate to Published Reports menu
   - Enter accession number
   - Get download link
   - Save PDF organized by patient folder

### Storage Strategy

Studies and report metadata stored in `chrome.storage.local` (up to 10MB in MV3). Each study entry includes:
- PACS metadata (patient, accession, modality, date, description)
- Report download status (pending / downloaded / not found)
- Report file path or blob URL

> [!IMPORTANT]
> **Open Question:** For PDF storage — Chrome extensions can't write to the filesystem directly. Options:
> 1. **Use Chrome Downloads API** — save PDFs to a Downloads subfolder (e.g., `HMIS_Reports/{PatientName}_{Accession}/`)
> 2. **Send back to RadOS backend** — upload PDFs to the backend for organized storage
> 3. **IndexedDB** — store PDF blobs in the extension's IndexedDB (limited by storage quota)
>
> **Recommendation:** Option 1 (Downloads API) for simplicity. What do you prefer?

---

### UI Changes

#### [MODIFY] [popup.html](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/popup.html)

Add a **third view** to the popup — a "PACS Studies" tab accessible from the header:

**Header update:**
- Add a tab bar below the header: `Dashboard` | `Studies` | `⚙ Settings`

**Studies View:**
- Search/filter bar (patient name, accession, date range)
- "Fetch from PACS" button to query the RadOS backend
- Study list table (compact rows): Date | Patient | MRN | Modality | Description | Accession | Status
- Each row has a "📄 Get Report" button
- Batch action: "Download All Reports" for selected studies
- Status indicators: ✓ Downloaded, ⟳ Pending, ✕ Not Found

**Settings View update:**
- New "RadOS Connection" card with:
  - API URL (e.g., `http://localhost:3000`)
  - API Key (the `extensionSecret` from the User model)
  - "Test Connection" button

#### [MODIFY] [popup.ts](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/popup.ts)

- Add tab navigation (Dashboard / Studies / Settings)
- PACS data fetching via `fetch()` to RadOS API
- Study list rendering with search/filter
- Report download trigger (sends message to content script)

#### [NEW] [src/modules/pacs-client.ts](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/modules/pacs-client.ts)

- `fetchStudies(apiUrl, apiKey, filters)` — calls RadOS `/api/dicom/studies`
- `getStudyDetails(apiUrl, apiKey, studyId)` — calls RadOS `/api/dicom/studies/[id]`
- Study caching in `chrome.storage.local`

#### [NEW] [src/modules/report-downloader.ts](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/modules/report-downloader.ts)

- Automates the HMIS report download flow:
  1. Switch role to Radiology PGR
  2. Navigate to published reports page
  3. Enter accession number
  4. Extract download link
  5. Download PDF via Chrome Downloads API
  6. Organize in `HMIS_Reports/{PatientName}_{AccessionNumber}/` folder

#### [MODIFY] [manifest.json](file:///d:/Projects/Radiology-Assistant/hmis-extension/manifest.json)

- Add `"downloads"` permission
- Add host permission for RadOS backend URL (e.g., `http://localhost:3000/*`)

#### [MODIFY] [types.ts](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/modules/types.ts)

- Add `PacsStudy`, `ReportDownloadStatus`, `PacsConfig` types
- Add RadOS API settings to `ExtensionConfig`

#### [NEW] RadOS Backend: [app/api/extension/studies/route.ts](file:///d:/Projects/Radiology-Assistant/app/api/extension/studies/route.ts)

- Public API endpoint (authenticated via `extensionSecret` instead of session)
- Returns PACS study list with filters (date range, modality, description)
- Reuses existing `findStudies()` from `lib/dicom/orthanc.ts`

---

## Open Questions

> [!WARNING]
> **1. PACS Server Access:** Your screenshot shows RadiAnt connecting to a local PACS. Is this PACS accessible from the machine running the RadOS backend? Or do we need the extension to connect to a **different** PACS endpoint?

> [!IMPORTANT]
> **2. Report Download Storage:** Where should downloaded HMIS report PDFs be saved?
> - **Option A:** Chrome Downloads folder (organized subfolders)
> - **Option B:** Upload to RadOS backend (persisted in database alongside study data)
> - **Option C:** Both — download locally AND sync to backend

> [!NOTE]
> **3. Study Date Filtering:** The RadiAnt screenshot shows "Last month" filter with 340 studies found. Should the extension default to a similar time range, or should it fetch studies for a specific date?

> [!NOTE]
> **4. Phase Priority:** Should I implement Part 1 (bug fixes) first and deliver, then move to Part 2 (PACS)? Or do you want everything together?

---

## Verification Plan

### Part 1 — Bug Fixes
- Navigate to HMIS login while already logged in elsewhere → verify extension stops after 3 attempts with clear error message
- Navigate to `/token/today` with empty queue → verify no infinite loop, status shows "Queue ready — waiting for patients"
- Manual stop from popup → verify everything halts cleanly

### Part 2 — PACS Pipeline
- Configure RadOS API URL in extension settings → test connection
- Fetch studies → verify list renders in Studies tab with correct data
- Click "Get Report" → verify HMIS automation downloads PDF correctly
- Verify PDFs saved in organized folder structure
