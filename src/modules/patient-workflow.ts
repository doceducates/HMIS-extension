/**
 * Patient Workflow Orchestrator — Coordinates the full patient visit automation.
 *
 * Delegates to focused modules:
 *   - summary-extractor.ts  → Extract data from Summary tab
 *   - clinical-rules.ts     → Resolve the full workflow (diagnoses + investigations)
 *   - diagnosis-handler.ts  → Fill the Diagnosis tab
 *   - investigation-handler.ts → Fill the Investigation tab
 *   - checkout-handler.ts   → Checkout and return to queue
 *   - match-engine.ts       → Fuzzy text matching for search results
 *
 * Handles all real-world Summary page scenarios:
 *   A: Both diagnosis + investigation present → use as-is
 *   B: Diagnosis but no investigation → rules suggest investigations
 *   C: Investigation/procedure but no diagnosis → rules infer diagnosis
 *   D: Empty summary → use configured defaults
 */

import { ExtensionConfig } from './types';
import { HMIS_SELECTORS } from './selectors';
import { waitForLivewire } from './livewire-utils';
import { WorkflowState, reportStatus, broadcastState } from './state';
import { extractDataFromSummary } from './summary-extractor';
import { resolveWorkflow } from './clinical-rules';
import { addDiagnosis } from './diagnosis-handler';
import { addInvestigation } from './investigation-handler';
import { performCheckout } from './checkout-handler';
import { savePatientRecord } from './patient-records';
import { PatientRecord } from './types';
import { delay, checkAbort, showToast, TIMING, findByText } from './utils';

// ════════════════════════════════════════════════════════════════
//  WORKFLOW STEP TRACKING
// ════════════════════════════════════════════════════════════════

type WorkflowStep = 'summary' | 'diagnosis' | 'investigation' | 'checkout';

interface WorkflowCheckpoint {
    patientInfo: string;
    completedSteps: WorkflowStep[];
    pendingSteps: WorkflowStep[];
    scenario: string;
    startedAt: string;
}

async function saveCheckpoint(checkpoint: WorkflowCheckpoint): Promise<void> {
    try {
        await chrome.storage.session.set({ workflowCheckpoint: checkpoint });
    } catch {
        // Session storage may not be available — non-critical
    }
}

async function clearCheckpoint(): Promise<void> {
    try {
        await chrome.storage.session.remove('workflowCheckpoint');
    } catch {
        // Silent
    }
}

// ════════════════════════════════════════════════════════════════
//  MAIN AUTOPILOT ENTRY POINT
// ════════════════════════════════════════════════════════════════

/**
 * Automates the full patient visit:
 *   Summary → Diagnosis → Investigation → Checkout
 */
export async function activateAutoPilot(config: ExtensionConfig) {
    console.log('HMIS Automation: Summary-based auto-pilot started.');
    reportStatus('Auto-pilot started', 'info');

    if (!config.autoPilotForm) {
        reportStatus('Auto-pilot disabled in settings', 'info');
        return;
    }

    WorkflowState.isRunning = true;
    WorkflowState.isStopped = false;
    broadcastState();

    const checkpoint: WorkflowCheckpoint = {
        patientInfo: '',
        completedSteps: [],
        pendingSteps: ['summary', 'diagnosis', 'investigation', 'checkout'],
        scenario: '',
        startedAt: new Date().toISOString(),
    };

    const record: PatientRecord = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        patientName: 'Unknown Patient',
        mrn: 'Unknown MRN',
        status: 'processing',
        scenario: '',
        provisionalDiagnosis: [],
        investigations: [],
        completedSteps: [],
        errors: [],
        durationMs: 0,
        tokenReleased: false
    };

    const startTime = Date.now();

    try {
        // ── Step 1: Navigate to Summary and Extract Data ──
        await saveCheckpoint(checkpoint);
        await navigateToTab(HMIS_SELECTORS.SIDE_MENU.SUMMARY, 'Summary');
        await delay(TIMING.SUMMARY_RENDER);
        const extracted = await extractDataFromSummary();
        reportStatus(`Extracted: ${extracted.diagnoses.length} diagnosis(es), ${extracted.investigations.length} investigation(s)`, 'info');
        console.log('Extracted Summary Data:', extracted);

        // Update record
        const nameEl = document.querySelector(HMIS_SELECTORS.PATIENT_INFO.NAME);
        const mrnEl = document.querySelector(HMIS_SELECTORS.PATIENT_INFO.MRN);
        if (nameEl && nameEl.textContent) record.patientName = nameEl.textContent.trim();
        if (mrnEl && mrnEl.textContent) record.mrn = mrnEl.textContent.trim();
        record.completedSteps.push('summary');

        checkpoint.completedSteps.push('summary');
        checkpoint.pendingSteps = checkpoint.pendingSteps.filter(s => s !== 'summary');
        await saveCheckpoint(checkpoint);

        // ── Step 2: Resolve what to fill using the clinical rules engine ──
        // This handles ALL scenarios: both present, diagnosis-only,
        // investigation-only, and completely empty summaries.
        // TIER 2: This now optionally calls the AI embedding model.
        const resolved = await resolveWorkflow(extracted, config);
        checkpoint.scenario = resolved.scenario;
        await saveCheckpoint(checkpoint);

        record.scenario = resolved.scenario;
        record.provisionalDiagnosis = resolved.diagnoses;
        record.investigations = resolved.investigations;

        reportStatus(`Scenario ${resolved.scenario}: ${resolved.reasoning}`, 'info');
        console.log('Resolved workflow:', resolved);

        // ── Step 3: Fill Diagnosis ──
        if (resolved.diagnoses.length > 0) {
            checkAbort();
            // Dynamic check: did the user turn off Auto Pilot mid-flow?
            if (!config.autoPilotForm) {
                reportStatus('Auto-pilot disabled by user — stopping', 'warning');
                return;
            }

            await navigateToTab(HMIS_SELECTORS.SIDE_MENU.DIAGNOSIS, 'Diagnosis');
            await delay(TIMING.TAB_SETTLE);

            for (const diag of resolved.diagnoses) {
                checkAbort();
                try {
                    const result = await addDiagnosis(config.defaultDiagnosisType || 'Provisional', diag);
                    if (result.error) {
                        record.errors.push({ step: 'diagnosis', message: result.error.message, timestamp: new Date().toISOString() });
                    }
                } catch (e: any) {
                    record.errors.push({ step: 'diagnosis', message: e.message, timestamp: new Date().toISOString() });
                }
            }
            reportStatus(`Diagnosis step complete (${resolved.diagnoses.length} items)`, 'success');
        } else {
            reportStatus('No diagnosis to fill — skipping', 'info');
        }

        checkpoint.completedSteps.push('diagnosis');
        record.completedSteps.push('diagnosis');
        checkpoint.pendingSteps = checkpoint.pendingSteps.filter(s => s !== 'diagnosis');
        await saveCheckpoint(checkpoint);

        // ── Step 4: Fill Investigation(s) ──
        if (resolved.investigations.length > 0) {
            checkAbort();
            // Dynamic check: did the user turn off Auto Pilot mid-flow?
            if (!config.autoPilotForm) {
                reportStatus('Auto-pilot disabled by user — stopping', 'warning');
                return;
            }

            await navigateToTab(HMIS_SELECTORS.SIDE_MENU.ORDER, 'Order/Investigations');
            await delay(TIMING.SELECT_SETTLE);

            // Click the Investigation sub-tab
            const invTab = document.querySelector(HMIS_SELECTORS.SIDE_MENU.INVESTIGATION_SUBTAB) as HTMLElement
                || findByText('a, button', 'Investigation');
            if (invTab) {
                invTab.click();
                await waitForLivewire(TIMING.SUBTAB_SETTLE);
            }

            for (const inv of resolved.investigations) {
                checkAbort();
                try {
                    const result = await addInvestigation(inv);
                    if (result.error) {
                        record.errors.push({ step: 'investigation', message: result.error.message, timestamp: new Date().toISOString() });
                    }
                } catch (e: any) {
                    record.errors.push({ step: 'investigation', message: e.message, timestamp: new Date().toISOString() });
                }
            }
            reportStatus(`Investigation step complete (${resolved.investigations.length} items)`, 'success');
        } else {
            reportStatus('No investigations to order — skipping', 'info');
        }

        checkpoint.completedSteps.push('investigation');
        record.completedSteps.push('investigation');
        checkpoint.pendingSteps = checkpoint.pendingSteps.filter(s => s !== 'investigation');
        await saveCheckpoint(checkpoint);

        // ── Step 5: Checkout ──
        checkAbort();
        // Dynamic Check: Use the LATEST config value for autoCheckout
        if (config.autoCheckout) {
            try {
                await performCheckout();
                checkpoint.completedSteps.push('checkout');
                record.completedSteps.push('checkout');
                checkpoint.pendingSteps = [];
                await saveCheckpoint(checkpoint);
            } catch (e: any) {
                record.errors.push({ step: 'checkout', message: e.message, timestamp: new Date().toISOString() });
            }
        } else {
            reportStatus('All forms filled ✓ — checkout manually or turn on Auto Checkout', 'success');
            // Wait a bit in case the user turns it on now
            await delay(2000);
            if (config.autoCheckout) {
                reportStatus('Auto Checkout detected — proceeding...', 'progress');
                await performCheckout();
                checkpoint.completedSteps.push('checkout');
                record.completedSteps.push('checkout');
                checkpoint.pendingSteps = [];
                await saveCheckpoint(checkpoint);
            }
        }

        // Clear checkpoint on success
        await clearCheckpoint();

        record.status = record.errors.length > 0 ? 'partial' : 'success';

    } catch (err: any) {
        record.status = 'error';
        record.errors.push({ step: 'workflow', message: err.message || 'Unknown error', timestamp: new Date().toISOString() });
        handleWorkflowError(err);
    } finally {
        // ═══ GUARANTEED TOKEN RELEASE ═══
        if (!record.completedSteps.includes('checkout')) {
            await safeReleaseToken(record);
        }

        record.durationMs = Date.now() - startTime;
        if (record.status === 'processing') {
            record.status = record.errors.length > 0 ? 'partial' : 'success';
        }
        await savePatientRecord(record);

        WorkflowState.isRunning = false;
        // broadcastRecordUpdate(record); // will be implemented in popup via GET_RECORDS or broadcast
        broadcastState();
    }
}

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Navigate to a sidebar tab and wait for Livewire to settle.
 * Tries the CSS selector first, then falls back to text-based matching.
 */
async function navigateToTab(selector: string, name: string) {
    checkAbort();

    // Try CSS selector first
    let tab = document.querySelector(selector) as HTMLElement;

    // Fallback: find by visible text in sidebar links
    if (!tab) {
        tab = findByText('a.nav-link, .nav-item a, .sidebar a', name) as HTMLElement;
    }

    if (tab) {
        reportStatus(`Navigating to ${name}...`, 'progress');
        tab.click();
        await waitForLivewire(TIMING.TAB_SETTLE);
    } else {
        reportStatus(`Tab "${name}" not found (selector: ${selector})`, 'error');
    }
}

function handleWorkflowError(err: any) {
    if (err.message === 'Aborted by user') {
        reportStatus('Workflow aborted by user', 'error');
    } else {
        console.error('Workflow Error:', err);
        reportStatus(`Error: ${err.message}`, 'error');
        showToast('Automation failed! Check logs.', true);
    }
}

/**
 * Safely releases the patient token to prevent locking.
 */
async function safeReleaseToken(record: PatientRecord): Promise<void> {
    try {
        reportStatus('Releasing patient token to prevent lock...', 'progress');
        
        const releaseBtn = document.querySelector('a[href*="resetTokenHomeButton"]') as HTMLElement || 
                           document.querySelector(HMIS_SELECTORS.NAV.HOME_BTN) as HTMLElement ||
                           document.querySelector('.btn-release-token') as HTMLElement;
                           
        if (releaseBtn) {
            releaseBtn.click();
            record.tokenReleased = true;
            reportStatus('Patient token released ✓', 'info');
        } else {
            record.tokenReleased = false;
            reportStatus('Warning: Release button not found. Token may be locked.', 'error');
        }
    } catch (e: any) {
        record.tokenReleased = false;
        reportStatus(`Failed to release token: ${e.message}`, 'error');
    }
}
