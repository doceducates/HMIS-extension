/**
 * Shared utility functions for the HMIS Automation extension.
 * Provides retry logic, typed DOM helpers, and timing utilities.
 */

import { WorkflowState } from './state';

// ════════════════════════════════════════════════════════════════
//  TIMING CONSTANTS — centralized for easy tuning
// ════════════════════════════════════════════════════════════════

export const TIMING = {
    /** After clicking a sidebar tab, wait for Livewire to render the panel */
    TAB_SETTLE: 1500,
    /** After changing a dropdown/select value */
    SELECT_SETTLE: 800,
    /** After typing into a search field (debounce before Enter) */
    SEARCH_DEBOUNCE: 500,
    /** After pressing Enter, wait for search results to load */
    SEARCH_RESULTS: 3000,
    /** After clicking Save button */
    POST_SAVE: 2000,
    /** After clicking a search result item */
    POST_SELECT: 1500,
    /** Small delay for DOM operations to settle */
    DOM_SETTLE: 200,
    /** Extra time for Summary cards to fully render */
    SUMMARY_RENDER: 1500,
    /** After clicking Checkout */
    POST_CHECKOUT: 2000,
    /** Delay before clicking next button */
    PRE_SUBMIT: 800,
    /** After checkout, before navigating home */
    POST_CHECKOUT_NAV: 1500,
    /** Delay between clearing input and typing */
    INPUT_CLEAR: 200,
    /** Investigation sub-tab settle time */
    SUBTAB_SETTLE: 1500,
} as const;

// ════════════════════════════════════════════════════════════════
//  RETRY UTILITIES
// ════════════════════════════════════════════════════════════════

/**
 * Retry an async function with exponential backoff.
 * Respects the workflow abort signal.
 *
 * @param fn        The async function to retry
 * @param label     Human-readable label for logging
 * @param maxRetries Maximum number of attempts (default: 3)
 * @param baseDelay Base delay in ms before first retry (default: 1000)
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 3,
    baseDelay = 1000
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            checkAbort();
            return await fn();
        } catch (err: any) {
            // Re-throw user aborts immediately
            if (err.message === 'Aborted by user') throw err;

            if (attempt === maxRetries) {
                console.error(`[Retry] ${label}: All ${maxRetries} attempts failed.`, err);
                throw err;
            }

            const waitMs = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`[Retry] ${label}: Attempt ${attempt}/${maxRetries} failed. Retrying in ${waitMs}ms...`, err.message);
            await delay(waitMs);
        }
    }
    // TypeScript needs this, but it's unreachable
    throw new Error(`${label}: Max retries exceeded`);
}

// ════════════════════════════════════════════════════════════════
//  TYPED DOM HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Query a DOM element with type safety and a descriptive error on failure.
 * Throws if the element is not found.
 *
 * @param selector  CSS selector to query
 * @param label     Human-readable label for error messages
 * @returns         The found element, cast to the specified type
 */
export function assertElement<T extends Element = HTMLElement>(
    selector: string,
    label: string
): T {
    const el = document.querySelector<T>(selector);
    if (!el) {
        throw new Error(`${label} not found (selector: ${selector})`);
    }
    return el;
}

/**
 * Query a DOM element, returning null if not found (no throw).
 * Use this when the element's absence is a valid/expected state.
 */
export function queryElement<T extends Element = HTMLElement>(
    selector: string
): T | null {
    return document.querySelector<T>(selector);
}

/**
 * Find an element by its visible text content.
 * Useful as a last-resort fallback when CSS selectors are fragile.
 *
 * @param tagSelector  Base CSS selector to narrow the search (e.g., 'a', 'button', 'li a')
 * @param text         The text to match (case-insensitive, partial match)
 * @param exact        If true, requires exact text match (after trimming)
 */
export function findByText<T extends HTMLElement = HTMLElement>(
    tagSelector: string,
    text: string,
    exact = false
): T | null {
    const needle = text.toLowerCase().trim();
    const candidates = document.querySelectorAll<T>(tagSelector);

    for (const el of Array.from(candidates)) {
        const elText = el.textContent?.toLowerCase().trim() || '';
        if (exact ? elText === needle : elText.includes(needle)) {
            return el;
        }
    }
    return null;
}

// ════════════════════════════════════════════════════════════════
//  COMMON HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Promise-based delay. Rejects early if the workflow is aborted.
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if the user has aborted the workflow. Throws if stopped.
 */
export function checkAbort(): void {
    if (WorkflowState.isStopped) throw new Error('Aborted by user');
}

/**
 * Display a toast notification on the HMIS page.
 * Consolidates the duplicate toast systems that existed in livewire-utils and patient-workflow.
 */
export function showToast(msg: string, isError = false, durationMs = 3500) {
    const bgColor = isError ? '#ef4444' : '#22c55e';
    const icon = isError ? '⚠️' : '🤖';

    const toast = document.createElement('div');
    toast.style.cssText = [
        'position: fixed',
        'bottom: 20px',
        'right: 20px',
        'padding: 15px',
        `background: ${bgColor}`,
        'color: white',
        'font-weight: bold',
        'border-radius: 8px',
        'z-index: 10000',
        'box-shadow: 0 4px 10px rgba(0,0,0,0.2)',
        'transition: opacity 0.5s',
        'font-family: sans-serif',
        'font-size: 14px',
    ].join('; ');
    toast.innerText = `${icon} ${msg}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 500);
    }, durationMs);
}
