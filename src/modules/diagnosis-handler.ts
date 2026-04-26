/**
 * Diagnosis Handler — Automates adding diagnoses on the HMIS Diagnosis tab.
 *
 * Workflow per diagnosis:
 *   1. Check if already present in the table (skip if duplicate)
 *   2. Select diagnosis type (Provisional/Final)
 *   3. Type query into search input
 *   4. Press Enter to trigger Livewire search
 *   5. Pick best match from results
 *   6. Click Save
 */

import { ExtensionConfig } from './types';
import { HMIS_SELECTORS } from './selectors';
import { setLivewireInput, waitForLivewire, clickLivewireElement } from './livewire-utils';
import { reportStatus } from './state';
import { findBestMatch } from './match-engine';
import { delay, checkAbort, retryWithBackoff, TIMING } from './utils';
import { StepResult } from './types';

/**
 * Add a single diagnosis entry to the HMIS Diagnosis tab.
 *
 * @param type   Diagnosis type — "Provisional" or "Final"
 * @param query  The diagnosis text to search for
 */
export async function addDiagnosis(type: string, query: string): Promise<StepResult> {
    return await retryWithBackoff(
        () => _addDiagnosisAttempt(type, query),
        `addDiagnosis("${query}")`,
        2, // max 2 attempts
        1500
    );
}

async function _addDiagnosisAttempt(type: string, query: string): Promise<StepResult> {
    reportStatus(`Adding diagnosis: "${query}"...`, 'progress');

    // Check if already present in table
    const existingRows = document.querySelectorAll('.table-striped tbody tr, #diagnosis-component table tbody tr');
    for (const row of Array.from(existingRows)) {
        if (row.textContent?.toLowerCase().includes(query.toLowerCase())) {
            reportStatus(`Diagnosis "${query}" already present — skipped`, 'info');
            return { success: true, skipped: true };
        }
    }

    // Select diagnosis type
    const typeSelect = document.querySelector(HMIS_SELECTORS.DIAGNOSIS.TYPE_SELECT) as HTMLSelectElement;
    if (typeSelect) {
        setLivewireInput(typeSelect, type);
        await waitForLivewire(TIMING.SELECT_SETTLE);
    }

    // Type into the search field
    const queryInput = document.querySelector(HMIS_SELECTORS.DIAGNOSIS.QUERY_INPUT) as HTMLInputElement;
    if (!queryInput) {
        throw new Error('Diagnosis search input not found');
    }

    // Focus, clear, and type
    queryInput.focus();
    queryInput.value = '';
    queryInput.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(TIMING.INPUT_CLEAR);

    setLivewireInput(queryInput, query);
    await delay(TIMING.SEARCH_DEBOUNCE);

    // Press Enter to trigger search
    queryInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    queryInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    reportStatus('Search triggered (Enter pressed)', 'progress');

    // Wait for results to load
    await waitForLivewire(TIMING.SEARCH_RESULTS);

    // Find best match from results
    const match = findBestMatch(HMIS_SELECTORS.DIAGNOSIS.LIST_ITEM, query);
    if (match) {
        reportStatus(`Selecting: "${match.textContent?.trim()}"`, 'progress');
        match.click();
        await waitForLivewire(TIMING.POST_SELECT);

        // Click save
        const saved = clickLivewireElement(HMIS_SELECTORS.DIAGNOSIS.SAVE_BTN);
        if (saved) {
            await waitForLivewire(TIMING.POST_SAVE);
            reportStatus(`Diagnosis "${query}" saved ✓`, 'success');
            return { success: true, skipped: false };
        } else {
            throw new Error('Diagnosis save button not found');
        }
    } else {
        reportStatus(`No search results for diagnosis "${query}"`, 'error');
        return { success: false, skipped: false, error: new Error(`No search results for diagnosis "${query}"`) };
    }
}
