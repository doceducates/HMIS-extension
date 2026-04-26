/**
 * Checkout Handler — Automates patient checkout and navigation back to queue.
 *
 * Handles the confirmation modal/dialog that HMIS may show when checking out,
 * then navigates back to the patient queue.
 */

import { HMIS_SELECTORS } from './selectors';
import { waitForLivewire } from './livewire-utils';
import { reportStatus } from './state';
import { delay, checkAbort, TIMING } from './utils';

/**
 * Performs patient checkout with confirmation dialog support.
 * After checkout, navigates back to the patient queue.
 */
export async function performCheckout(): Promise<void> {
    reportStatus('Checking out patient...', 'progress');
    checkAbort();

    const checkoutBtn = document.querySelector(HMIS_SELECTORS.NAV.CHECKOUT_BTN) as HTMLElement;
    if (!checkoutBtn) {
        reportStatus('Checkout button not found — may already be checked out', 'info');
        return;
    }

    try {
        checkoutBtn.click();
        await waitForLivewire(TIMING.POST_CHECKOUT);

    // Handle potential confirmation modal/dialog
    const confirmBtn = document.querySelector(
        '.swal2-confirm, .modal .btn-primary, .modal .btn-success, button.confirm-checkout, [wire\\:click*="checkout"]'
    ) as HTMLElement;

    if (confirmBtn) {
        reportStatus('Confirming checkout...', 'progress');
        confirmBtn.click();
        await waitForLivewire(TIMING.SEARCH_RESULTS); // 3s for confirmation to process
    }

        reportStatus('Patient checkout complete ✓', 'success');

        // Navigate back to queue after checkout
        await delay(TIMING.POST_CHECKOUT_NAV);
        const homeBtn = document.querySelector(HMIS_SELECTORS.NAV.HOME_BTN) as HTMLElement;
        if (homeBtn) {
            reportStatus('Returning to patient queue...', 'progress');
            homeBtn.click();
        }
    } catch (err) {
        reportStatus('Error during checkout', 'error');
        throw err;
    }
}
