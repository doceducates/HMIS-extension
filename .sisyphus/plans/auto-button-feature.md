# Work Plan: Add "Auto" Button to Live Queue Patient Cards

## TL;DR

> **Quick Summary**: Add a third icon-only button to each patient card in the Live Queue view that triggers the default auto-flow (no assess/procedure mode override).

> **Deliverables**:
> - Updated popup.ts with new Auto button
> - Updated popup.html with tooltip styles
> - Updated content.ts to handle 'auto' mode

> **Estimated Effort**: Short
> **Parallel Execution**: NO - Sequential (UI changes + logic)
> **Critical Path**: UI Update → Logic Handler → Test

---

## Context

### Original Request
User wants a third button in the Live Queue for each patient to run simple auto-flow (default behavior) without explicitly setting assess or procedure mode.

### Current Behavior
- **Assess button**: Sets `mode='assess'` → converts procedures to USG
- **Procedure button**: Sets `mode='procedure'` → keeps procedures as-is
- **No button clicked** → main "Start Automation" processes with default flow

### User Requirements
1. Add third "Auto" button for individual patients
2. Icon-only with tooltip (not text) to save space
3. Clean UI that doesn't get cluttered
4. User plans full-page UI later - keep it simple for now

---

## Work Objectives

### Core Objective
Add an "Auto" button to each patient card in the Live Queue that triggers the default auto-flow for that specific patient.

### Concrete Deliverables
1. Modified `popup.ts` - Add Auto button with icon-only styling
2. Modified `popup.html` - Add tooltip CSS styles
3. Modified `content.ts` - Handle 'auto' mode (pass undefined to workflow)

### Definition of Done
- [ ] Each patient card shows 3 icon buttons: 🩺 💉 ⚡
- [ ] Hovering shows tooltip explaining each mode
- [ ] Auto button triggers default workflow (no mode override)
- [ ] UI remains clean on small screens

### Must Have
- Icon-only buttons with tooltips
- Auto mode passes `undefined` to clinical-rules.ts
- Same click handling as existing buttons

### Must NOT Have
- Text labels on queue buttons (icon only)
- Breaking existing assess/procedure functionality
- UI overflow or wrapping issues

---

## Execution Strategy

### Tasks

#### Task 1: Add Tooltip CSS Styles (popup.html)
**What to do**:
Add tooltip styling for the icon buttons in popup.html. Use CSS `::after` with `data-tooltip` attribute for clean tooltips.

**References**:
- popup.html lines 40-46 - Current body width is 380px
- popup.html lines 482-489 - Current button styling

**Acceptance Criteria**:
- [ ] Tooltip styles added to popup.html
- [ ] Tooltips appear on hover for each button
- [ ] Text is readable on dark theme

---

#### Task 2: Update Queue Card Rendering (popup.ts)
**What to do**:
Replace the two text-based buttons with three icon-only buttons:
- 🩺 Assess (stethoscope) - with tooltip "Assessment Mode: Convert procedures to USG"
- 💉 Procedure (syringe) - with tooltip "Procedure Mode: Keep procedures as-is"  
- ⚡ Auto (lightning) - with tooltip "Auto Mode: Use defaults from summary"

Update button styling to be square icons (32x32px) with consistent gap.

**References**:
- popup.ts lines 482-489 - Current button rendering
- popup.ts lines 495-501 - Click handlers

**Acceptance Criteria**:
- [ ] 3 icon buttons render per patient card
- [ ] Each button has tooltip on hover
- [ ] Click handlers pass correct mode ('assess', 'procedure', 'auto')

---

#### Task 3: Update Message Handler (content.ts)
**What to do**:
Update the PROCESS_SPECIFIC_PATIENT handler to:
- Accept 'auto' as a valid mode
- When mode is 'auto', don't set targetedMode in session (or set to null)
- This ensures clinical-rules.ts receives undefined for mode

**References**:
- content.ts lines 174-191 - Current message handler

**Acceptance Criteria**:
- [ ] 'auto' mode handled in content.ts
- [ ] No targetedMode set when 'auto' is clicked
- [ ] Existing assess/procedure modes still work

---

#### Task 4: Verify Integration
**What to do**:
Verify all three modes work correctly by reviewing the code flow:
1. popup.ts sends `mode: 'auto'`
2. content.ts receives and processes
3. patient-workflow.ts passes to clinical-rules.ts
4. clinical-rules.ts treats undefined as default auto-flow

**References**:
- content.ts line 180-184 - targetedMode setting
- patient-workflow.ts lines 133-141 - mode usage
- clinical-rules.ts lines 211-232 - mode handling

**Acceptance Criteria**:
- [ ] Code path verified for all 3 modes
- [ ] No type errors in TypeScript

---

## Verification Strategy

### QA Scenarios

**Scenario: Click Auto button for specific patient**
- Preconditions: Extension loaded, on queue page with patients
- Steps:
  1. Open Live Queue view
  2. Hover over ⚡ button - verify tooltip shows
  3. Click ⚡ button
  4. Observe workflow starts for that patient
- Expected Result: Patient processed with default auto-flow
- Evidence: Check activity log shows auto-pilot started without assess/procedure messages

**Scenario: Assess and Procedure buttons still work**
- Preconditions: Extension loaded, on queue page with patients
- Steps:
  1. Click 🩺 Assess on first patient
  2. Click 💉 Procedure on second patient
- Expected Result: Each processes with correct mode conversion
- Evidence: Activity log shows mode-specific messages

**Scenario: Tooltips display correctly**
- Preconditions: Extension popup open
- Steps:
  1. Open Live Queue
  2. Hover over each of the 3 buttons
- Expected Result: Tooltips appear with correct text, no UI overflow

---

## Commit Strategy

- Single commit preferred for this small feature
- Message: `feat(queue): add auto button to patient cards`
- Files: src/popup.ts, src/popup.html, src/content.ts

---

## Success Criteria

- [ ] Each patient card shows 3 icon buttons (🩺 💉 ⚡)
- [ ] Hover tooltips explain each mode
- [ ] Auto button triggers default flow
- [ ] UI fits within 380px popup width
- [ ] No TypeScript errors