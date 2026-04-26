/**
 * Investigation Handler — Automates ordering investigations on the HMIS
 * Order/Investigation tab.
 *
 * Workflow per investigation:
 *   1. Type query into CPT search input
 *   2. Press Enter to trigger Livewire search
 *   3. Pick best match from results
 *   4. Click Save
 *   5. Clear input for the next entry
 */

import { HMIS_SELECTORS } from './selectors';
import { setLivewireInput, waitForLivewire, clickLivewireElement } from './livewire-utils';
import { reportStatus } from './state';
import { findBestMatch } from './match-engine';
import { delay, checkAbort, retryWithBackoff, TIMING } from './utils';
import { ExtensionConfig, StepResult } from './types';

/**
 * Add a single investigation order to the HMIS Investigation tab.
 *
 * @param name  The investigation/CPT name to search for
 */
export async function addInvestigation(name: string, config: ExtensionConfig): Promise<StepResult> {
    return await retryWithBackoff(
        () => _addInvestigationAttempt(name, config),
        `addInvestigation("${name}")`,
        2, // max 2 attempts
        1500
    );
}

async function _addInvestigationAttempt(name: string, config: ExtensionConfig): Promise<StepResult> {
    reportStatus(`Ordering investigation: "${name}"...`, 'progress');

    // Check if already present in table (if safeguard is enabled)
    if (config.preventDuplicateOrders !== false) {
        const existingRows = document.querySelectorAll('.table-striped tbody tr, #order-investigation-component table tbody tr, .investigation-list tbody tr');
        for (const row of Array.from(existingRows)) {
            if (row.textContent?.toLowerCase().includes(name.toLowerCase())) {
                reportStatus(`Investigation "${name}" already present — skipped`, 'info');
                return { success: true, skipped: true };
            }
        }
    }

    // Type into the search field
    const queryInput = document.querySelector(HMIS_SELECTORS.INVESTIGATION.QUERY_INPUT) as HTMLInputElement;
    if (!queryInput) {
        throw new Error('Investigation search input not found');
    }

    // Focus, clear, and type
    queryInput.focus();
    queryInput.value = '';
    queryInput.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(TIMING.INPUT_CLEAR);

    setLivewireInput(queryInput, name);
    await delay(TIMING.SEARCH_DEBOUNCE);

    // Press Enter to trigger search
    queryInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    queryInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    reportStatus('Investigation search triggered', 'progress');

    // Wait for results
    await waitForLivewire(TIMING.SEARCH_RESULTS);

    // Find best match
    const match = findBestMatch(HMIS_SELECTORS.INVESTIGATION.LIST_ITEM, name);
    if (match) {
        reportStatus(`Selecting: "${match.textContent?.trim()}"`, 'progress');
        match.click();
        await waitForLivewire(TIMING.POST_SELECT);

        // Click save
        const saved = clickLivewireElement(HMIS_SELECTORS.INVESTIGATION.SAVE_BTN);
        if (saved) {
            await waitForLivewire(TIMING.POST_SAVE);
            reportStatus(`Investigation "${name}" ordered ✓`, 'success');
            
            // Clear the input for the next investigation
            queryInput.value = '';
            queryInput.dispatchEvent(new Event('input', { bubbles: true }));
            await delay(TIMING.DOM_SETTLE);
            
            return { success: true, skipped: false };
        } else {
            throw new Error('Investigation save button not found');
        }
    } else {
        reportStatus(`No search results for investigation "${name}"`, 'error');
        return { success: false, skipped: false, error: new Error(`No search results for investigation "${name}"`) };
    }
}
