# HMIS Autopilot Extension — Analysis & Roadmap

## Current State Summary

The extension is well-structured with ~1,700 lines of TypeScript across 8 modules. It automates the full HMIS clinical workflow: **Login → Department → Role → Queue → Patient Encounter (Summary → Diagnosis → Investigation → Checkout)**. The architecture (content script ↔ background relay ↔ popup cockpit) is solid for a Chrome MV3 extension.

---

## 🔧 Part 1: Improvement Suggestions

### 1. Robustness & Reliability

#### A. Selector Fragility — The #1 Risk
The selectors in [selectors.ts](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/modules/selectors.ts) mix stable selectors (IDs, `wire:model`) with fragile ones (`.card`, `h4, h5, h6`, positional like `li:nth-child(3) a.nav-link`).

```diff
 // Current — fragile: breaks if HMIS reorders sidebar tabs
 DIAGNOSIS: 'a[href*="diagnosis"], li:nth-child(3) a.nav-link',
 
 // Better — text-based fallback with resilient matching
+DIAGNOSIS: 'a[href*="diagnosis"]',  // drop positional fallback
```

> [!IMPORTANT]
> **Recommendation:** Create a `findByText()` utility that finds elements by visible text content as a last-resort fallback. This is more resilient than positional selectors when HMIS updates their UI.

#### B. No Retry Logic on Form Operations
`addDiagnosis()` and `addInvestigation()` attempt each step **exactly once**. If a Livewire search takes 4+ seconds on a slow connection, the 3-second `waitForLivewire()` expires silently.

**Suggestion:** Add a `retryWithBackoff()` utility:
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  maxRetries = 3, 
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); } 
    catch (e) {
      if (i === maxRetries - 1) throw e;
      await delay(baseDelay * Math.pow(2, i));
    }
  }
  throw new Error('Max retries exceeded');
}
```

#### C. Captcha Operator Detection
The captcha solver [assumes addition](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/modules/login-handler.ts#L99-L101) but the comment says HMIS "sometimes uses subtraction."

**Suggestion:** Parse the operator from the DOM label text (e.g., the `+` or `-` character between `num1` and `num2`):
```typescript
function solveCaptcha() {
  // Find the operator text between the two numbers
  const captchaLabel = document.querySelector('.captcha-text, label[for="user_answer"]');
  const operator = captchaLabel?.textContent?.includes('-') ? '-' : '+';
  const answer = operator === '-' ? val1 - val2 : val1 + val2;
}
```

---

### 2. Code Quality & Maintainability

#### A. `patient-workflow.ts` is a 488-line Monolith
This single file handles extraction, diagnosis fill, investigation fill, checkout, and matching — five distinct concerns.

**Suggestion:** Split into focused modules:
| New Module | Responsibility |
|---|---|
| `summary-extractor.ts` | `extractDataFromSummary()`, card parsing |
| `diagnosis-handler.ts` | `addDiagnosis()`, type selection, search |
| `investigation-handler.ts` | `addInvestigation()`, CPT search |
| `checkout-handler.ts` | `performCheckout()`, confirmation dialogs |
| `match-engine.ts` | `findBestMatch()`, `findBestFromNodeList()` |

#### B. Hardcoded `delay()` Values Everywhere
There are ~15 hardcoded `delay(800)`, `delay(1500)`, `delay(2000)` calls. Network speed varies wildly in Pakistani hospital settings.

**Suggestion:** Make timing configurable or adaptive:
```typescript
// In config.ts
export const TIMING = {
  LIVEWIRE_SETTLE: 1500,    // After clicking a tab
  SEARCH_DEBOUNCE: 500,     // After typing in search
  SEARCH_RESULTS: 3000,     // Wait for search results
  POST_SAVE: 2000,          // After clicking Save
};

// Better: adaptive timing based on observed Livewire response times
```

#### C. No TypeScript Strict Null Checks
The `tsconfig.json` has `strict: true` but the code uses `as HTMLElement` casts liberally without null guards.

**Suggestion:** Use a typed `assertElement()` helper:
```typescript
function assertElement<T extends Element>(
  selector: string, label: string
): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`${label} not found (${selector})`);
  return el;
}
```

#### D. Duplicated Toast System
Both `livewire-utils.ts` (`showToast`) and `patient-workflow.ts` (`notifyError`) create floating toast notifications with similar but slightly different styling. Consolidate into one.

---

### 3. UX & Popup Improvements

#### A. No Progress Indicator for Multi-Step Workflow
The activity feed is a flat log. During the 5-step autopilot (Summary → Diagnosis → Investigation → Checkout), there's no visual indicator of "step 3 of 5."

**Suggestion:** Add a step progress bar to the dashboard:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✓ Summary  ✓ Diagnosis  ⟳ Investigation  ○ Checkout
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### B. No Patient Count / Queue Stats
The popup doesn't show how many patients are in the queue or how many have been processed.

**Suggestion:** Track and display:
- Patients processed today: `X`
- Current queue size: `Y`
- Average processing time: `Z seconds`

#### C. Settings Don't Show Hospital Name
The hospital ID is hardcoded to `19` (Lahore General Hospital) but there's no way for other doctors to pick their hospital from the popup — they'd need to edit the source.

**Suggestion:** Add a hospital dropdown in settings (populated from the HMIS login page's `<select>` options).

#### D. Popup Inline CSS is 500+ Lines
All styles are in `popup.html` `<style>` block (lines 9–516). Consider extracting to `popup.css` for maintainability.

---

### 4. Security Concerns

> [!CAUTION]
> **Credentials stored in plaintext** in `chrome.storage.local`. Anyone with physical access to the machine can extract them via DevTools → Application → Storage.

**Suggestions:**
- Use `chrome.storage.session` for credentials (cleared when browser closes)
- Or encrypt with a user-provided PIN before storing
- At minimum, warn users in the UI that credentials are stored locally

---

### 5. Error Recovery Improvements

#### A. No Dirty State Detection
If the extension crashes mid-workflow (e.g., browser crash), there's no way to detect that a patient was partially processed (diagnosis saved but investigation not).

**Suggestion:** Save workflow checkpoints:
```typescript
// Before each step
await chrome.storage.session.set({ 
  workflowCheckpoint: { 
    patientMrn: '...', 
    completedSteps: ['summary', 'diagnosis'], 
    pendingSteps: ['investigation', 'checkout'] 
  } 
});
```

#### B. `resolveInvestigations()` Has Hardcoded Clinical Logic
The [swelling → USG Swelling mapping](file:///d:/Projects/Radiology-Assistant/hmis-extension/src/modules/patient-workflow.ts#L114-L119) is hardcoded. This is where AI could help (see Part 2).

---

## 🧠 Part 2: In-Browser AI Classification — Feasibility Analysis

### Your Idea
Use a small 1-bit quantized model (Bonsai-style) running entirely in-browser to:
1. **Diagnosis Selection** — Given symptoms/complaints, suggest the best ICD-10 diagnosis from the HMIS dropdown
2. **Investigation Ordering** — Given the diagnosis, suggest the most appropriate radiology investigation from the CPT dropdown

### Feasibility Verdict: ✅ Very Feasible — But Not Bonsai LLMs

> [!IMPORTANT]
> **Key Insight:** You don't need a full LLM here. This is a **text classification / semantic matching** problem, not text generation. A much smaller, specialized model will work better and faster.

### Recommended Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    AI-Assisted Selection                          │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Option A: Embedding Model (RECOMMENDED)                          │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐     │
│  │ Patient   │───▶│ MiniLM-L6    │───▶│ Cosine Similarity    │     │
│  │ Summary   │    │ (22MB ONNX)  │    │ vs ICD-10 Embeddings │     │
│  └──────────┘    └──────────────┘    └──────────────────────┘     │
│                                              │                     │
│                                     ┌────────▼───────────┐        │
│                                     │ Top-5 Ranked       │        │
│                                     │ Diagnosis Matches  │        │
│                                     └────────────────────┘        │
│                                                                    │
│  Option B: Full Bonsai LLM (OVERKILL for this task)               │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐     │
│  │ Patient   │───▶│ Bonsai-0.5B  │───▶│ Generated text       │     │
│  │ Summary   │    │ (240MB)      │    │ → parse → match      │     │
│  └──────────┘    └──────────────┘    └──────────────────────┘     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Option A: Semantic Embedding Model (⭐ Recommended)

| Property | Details |
|---|---|
| **Model** | `all-MiniLM-L6-v2` (Sentence Transformers) |
| **Size** | ~22MB quantized ONNX |
| **Runtime** | `@xenova/transformers` (Transformers.js) or `onnxruntime-web` |
| **Inference Time** | 20-50ms per embedding on CPU |
| **How It Works** | Pre-embed all ICD-10 codes + CPT codes into a vector index. At runtime, embed the patient's complaints/diagnosis text, then find nearest matches via cosine similarity. |

**Why this is perfect for your use case:**
- HMIS has a **fixed set** of diagnoses (ICD-10) and investigations (CPT codes) in its dropdowns
- You need to **match** extracted text to the closest item in a known list
- This is literally what embedding similarity search does
- 22MB model loads in <2 seconds, runs inference in <50ms
- No GPU needed — WASM SIMD is sufficient

**Implementation sketch:**
```typescript
// ai-assist.ts — runs in extension service worker or offscreen document
import { pipeline } from '@xenova/transformers';

let embedder: any = null;
let icd10Index: { code: string; label: string; embedding: Float32Array }[] = [];

async function initAI() {
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true // Uses INT8 quantization → ~22MB
  });
  
  // Pre-compute embeddings for all known ICD-10 codes
  // This can be done once and cached in IndexedDB
  for (const entry of ICD10_DATABASE) {
    const emb = await embedder(entry.label, { pooling: 'mean', normalize: true });
    icd10Index.push({ ...entry, embedding: emb.data });
  }
}

async function suggestDiagnosis(patientText: string): Promise<ScoredMatch[]> {
  const queryEmb = await embedder(patientText, { pooling: 'mean', normalize: true });
  
  return icd10Index
    .map(entry => ({
      ...entry,
      score: cosineSimilarity(queryEmb.data, entry.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
```

### Option B: Bonsai 1-bit LLM

| Property | Details |
|---|---|
| **Model** | Bonsai 1-bit (e.g., Bonsai-Qwen-0.5B-1bit) |
| **Size** | ~240MB |
| **Runtime** | WebGPU via Transformers.js or custom WASM |
| **Inference Time** | 2-10 seconds per query |
| **How It Works** | Prompt the model: "Given symptoms: back pain, sciatica. What is the ICD-10 diagnosis?" → Parse output |

**Pros:** More flexible, can handle edge cases, can provide reasoning
**Cons:** 240MB initial download, 2-10s latency, requires WebGPU (not all hospital PCs have it), output needs parsing and validation, overkill for lookup

### Option C: Chrome Built-in AI (Gemini Nano)

| Property | Details |
|---|---|
| **Model** | Gemini Nano (ships with Chrome 131+) |
| **Size** | 0MB download (pre-installed) |
| **Runtime** | `window.ai` API |
| **Availability** | Chrome 131+ with `#optimization-guide-on-device-model` flag |

**Pros:** No model download, Google-maintained
**Cons:** Requires Chrome flags, not stable API yet, may not be available on hospital PCs with older Chrome

---

### 🏆 Recommended Approach: Hybrid

```
┌─────────────────────────────────────────────────────────────────┐
│  Tier 1: Rule-based mapping (instant, 0 overhead)              │
│  - "back pain" → L5-S1 Disc Herniation                        │
│  - "USG Abdomen" in summary → order USG Abdomen                │
│  - You already have this partially (swelling → USG Swelling)   │
├─────────────────────────────────────────────────────────────────┤
│  Tier 2: Embedding similarity (22MB model, <50ms)              │
│  - For cases where rules don't match                           │
│  - Rank ICD-10 codes by semantic similarity                    │
│  - Rank CPT codes by diagnosis-investigation correlation       │
├─────────────────────────────────────────────────────────────────┤
│  Tier 3: Bonsai/LLM (optional, 240MB, 2-10s)                  │
│  - Only for complex/ambiguous cases                            │
│  - User manually triggers "Ask AI" button                      │
│  - Can explain its reasoning                                   │
└─────────────────────────────────────────────────────────────────┘
```

### What You'd Need to Build

#### Phase 1: Rule Engine (Zero AI, immediate value)
- [NEW] `src/modules/clinical-rules.ts` — A mapping table:
  ```typescript
  const DIAGNOSIS_RULES: Record<string, string[]> = {
    'back pain': ['Lumbar spondylosis', 'Disc herniation', 'Sciatica'],
    'swelling': ['Soft tissue swelling', 'Lymphadenopathy'],
    'abdominal pain': ['Acute abdomen', 'Renal colic', 'Cholecystitis'],
  };
  
  const INVESTIGATION_RULES: Record<string, string[]> = {
    'Disc herniation': ['MRI Lumbar Spine', 'X-Ray LS Spine'],
    'Renal colic': ['USG KUB', 'CT KUB'],
    'Cholecystitis': ['USG Abdomen'],
  };
  ```
- This replaces the current hardcoded `swelling → USG Swelling` logic with an extensible system

#### Phase 2: AI Embeddings (22MB download, <50ms inference)
- [NEW] `src/modules/ai-engine.ts` — Embedding model loader + similarity search
- [NEW] `src/data/icd10-embeddings.json` — Pre-computed embeddings for common ICD-10 codes
- [NEW] `src/data/cpt-embeddings.json` — Pre-computed embeddings for radiology CPT codes
- [MODIFY] `manifest.json` — Add `offscreen` permission for running model in background
- [MODIFY] `popup.html` — Add "AI Assist" toggle chip + confidence indicators

#### Phase 3: Bonsai LLM (Optional, power-user feature)
- [NEW] `src/modules/bonsai-engine.ts` — Bonsai model loader via Transformers.js
- User downloads model on first use (240MB, cached in IndexedDB)
- "Ask AI" button on the diagnosis/investigation step shows a reasoning panel

---

### Technical Constraints in Chrome Extensions

> [!WARNING]
> **Chrome Extensions cannot use Web Workers or WebGPU in content scripts.** The model MUST run in either:
> 1. **Service Worker** (background.ts) — limited to 5 minutes of execution
> 2. **Offscreen Document** — best option for persistent model loading
> 3. **Popup** — only while popup is open

**Recommended:** Use an **Offscreen Document** for the AI engine. It persists as long as needed, has full DOM/WebGPU access, and communicates with content scripts via the background relay.

---

## 📋 Summary of All Suggestions

| Category | Suggestion | Effort | Impact |
|---|---|---|---|
| **Robustness** | Text-based selector fallbacks | Low | High |
| **Robustness** | Retry logic with backoff | Low | High |
| **Robustness** | Captcha operator detection | Low | Medium |
| **Code Quality** | Split patient-workflow.ts | Medium | High |
| **Code Quality** | Centralize timing constants | Low | Medium |
| **Code Quality** | Consolidate toast systems | Low | Low |
| **Code Quality** | Typed element assertions | Low | Medium |
| **UX** | Step progress indicator | Medium | High |
| **UX** | Patient count / stats | Medium | Medium |
| **UX** | Hospital picker in settings | Low | Medium |
| **UX** | Extract CSS to separate file | Low | Low |
| **Security** | Encrypt stored credentials | Medium | High |
| **Error Recovery** | Workflow checkpoints | Medium | High |
| **AI — Phase 1** | Clinical rules engine | Low | High |
| **AI — Phase 2** | Embedding model (22MB) | High | Very High |
| **AI — Phase 3** | Bonsai LLM (optional) | Very High | Medium |

> [!TIP]
> **My recommended priority order:**
> 1. Clinical rules engine (replaces hardcoded swelling logic, immediate value)
> 2. Split patient-workflow.ts + retry logic (prevents the most failures)
> 3. Workflow checkpoints + step progress bar (UX + reliability)
> 4. Embedding model AI assist (the real game-changer)
> 5. Bonsai LLM (only if embedding model isn't accurate enough)

---

## Open Questions for You

1. **Clinical Rules:** Do you have a list of the most common diagnosis-investigation pairings you see in your radiology practice? I can build the rules engine from that.

2. **ICD-10 Scope:** How many ICD-10 codes does the HMIS dropdown typically contain? If it's <500, the embedding approach is trivially fast. If it's 10,000+, we need to pre-filter by specialty.

3. **AI Toggle UX:** Should AI suggestions appear as:
   - (A) Auto-selections (AI picks the best match automatically, like current autopilot)
   - (B) A ranked suggestion list where the doctor confirms before selecting
   - (C) Both — auto-select with a "review" option

4. **Bonsai Priority:** Do you want to start with the lightweight embedding approach first, or do you specifically want to experiment with Bonsai 1-bit models right away?
