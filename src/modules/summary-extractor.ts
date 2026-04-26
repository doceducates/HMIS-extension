/**
 * Summary Extractor — Extracts diagnosis and investigation data from the
 * HMIS patient encounter Summary tab.
 *
 * The Summary page uses a 2-column col-md-6 grid with styled headings.
 * This module tries multiple extraction strategies for resilience.
 *
 * Verified against live HMIS DOM on 2026-04-25:
 *   - Sections: Vitals, Presenting Complaints, Diagnosis, Allergies,
 *     Immunization, Medication, Pathology, Radiology
 *   - Diagnosis items: "✓ Provisional" on line 1, diagnosis name on line 2
 *   - Radiology/Pathology items have LONG numeric CPT codes appended
 *     DIRECTLY to the text with NO space separator:
 *       "USG FNAC (Fine Needle Aspiration Cytology)00100000000010005"
 *       "Anti HIV by Elisa001000000000T86720"
 */

import { HMIS_SELECTORS } from './selectors';
import { reportStatus } from './state';

export interface ExtractedSummaryData {
    diagnoses: string[];
    investigations: string[];
}

/**
 * Extracts Diagnosis and Radiology data from the summary page cards.
 * Tries card-based extraction first, then falls back to a broad DOM scan.
 *
 * Returns whatever was found — may be empty for both fields.
 * The clinical-rules engine handles the "what to do when empty" logic.
 */
export async function extractDataFromSummary(): Promise<ExtractedSummaryData> {
    const data: ExtractedSummaryData = {
        diagnoses: [],
        investigations: []
    };

    // Strategy 1: Card/column-based extraction (primary)
    extractFromCards(data);

    // Strategy 2: If no cards matched, try broader DOM scan
    if (data.diagnoses.length === 0 && data.investigations.length === 0) {
        reportStatus('Card extraction found nothing — trying broad DOM scan', 'info');
        extractFromBroadScan(data);
    }

    // Deduplicate
    data.diagnoses = [...new Set(data.diagnoses)];
    data.investigations = [...new Set(data.investigations)];

    // Log what we found for transparency
    if (data.diagnoses.length === 0 && data.investigations.length === 0) {
        reportStatus('Summary page appears empty — no diagnosis or investigation found', 'info');
    } else {
        if (data.diagnoses.length > 0) {
            reportStatus(`Diagnoses found: ${data.diagnoses.join(', ')}`, 'info');
        }
        if (data.investigations.length > 0) {
            reportStatus(`Investigations found: ${data.investigations.join(', ')}`, 'info');
        }
    }

    return data;
}

// ════════════════════════════════════════════════════════════════
//  EXTRACTION STRATEGIES
// ════════════════════════════════════════════════════════════════

/**
 * Strategy 1: Find `.card` / `.col-md-6` / `.panel` / `.section` elements
 * and check their headings for "Diagnosis" or "Radiology".
 */
function extractFromCards(data: ExtractedSummaryData): void {
    const cards = document.querySelectorAll(HMIS_SELECTORS.SUMMARY.CARDS);

    cards.forEach(card => {
        const headerEl = card.querySelector(HMIS_SELECTORS.SUMMARY.CARD_HEADER)
            || card.querySelector('h5')
            || card.querySelector('.card-header');
        const header = headerEl?.textContent?.trim() || '';
        const items = card.querySelectorAll(HMIS_SELECTORS.SUMMARY.ITEM_TEXT);

        const headerLower = header.toLowerCase();

        if (headerLower.includes('diagnosis')) {
            extractDiagnosisItems(items, data);
        } else if (
            headerLower.includes('radiology') ||
            headerLower.includes('investigation') ||
            headerLower.includes('procedure') ||
            headerLower.includes('order')
        ) {
            extractInvestigationItems(items, data);
        }
    });
}

/**
 * Strategy 2: Broad DOM scan — look for any heading-like element that
 * mentions "Diagnosis" or "Radiology" and extract sibling content.
 */
function extractFromBroadScan(data: ExtractedSummaryData): void {
    const allHeaders = document.querySelectorAll('h4, h5, h6, .card-header, .section-title, strong, b');

    allHeaders.forEach(h => {
        const hText = h.textContent?.trim().toLowerCase() || '';
        // Walk up to the nearest container — try .card, .col-md-6, or direct parent
        const parent = h.closest('.card') || h.closest('.col-md-6') || h.parentElement;
        if (!parent) return;

        const contentItems = parent.querySelectorAll('p, li, span, .item-text, .summary-item, span.badge');

        if (hText.includes('diagnosis')) {
            contentItems.forEach(item => {
                const t = cleanDiagnosisText(item.textContent || '');
                if (isValidExtractedText(t) && !t.toLowerCase().includes('diagnosis')) {
                    data.diagnoses.push(t);
                }
            });
        } else if (
            hText.includes('radiology') ||
            hText.includes('investigation') ||
            hText.includes('procedure') ||
            hText.includes('order')
        ) {
            contentItems.forEach(item => {
                const t = cleanInvestigationText(item.textContent || '');
                if (isValidExtractedText(t) && !isHeaderText(t)) {
                    data.investigations.push(t);
                }
            });
        }
    });
}

// ════════════════════════════════════════════════════════════════
//  ITEM EXTRACTION HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Extract individual diagnosis items from a card's content elements.
 * Handles: "Provisional - Disc Herniation", "Final - Lumbar Spondylosis", etc.
 */
function extractDiagnosisItems(items: NodeListOf<Element>, data: ExtractedSummaryData): void {
    items.forEach(item => {
        const text = item.textContent?.trim() || '';
        const cleanText = cleanDiagnosisText(text);
        if (isValidExtractedText(cleanText)) {
            data.diagnoses.push(cleanText);
        }
    });
}

/**
 * Extract investigation/procedure items from a card's content elements.
 * Handles both imaging studies (USG Abdomen) and interventional procedures
 * (USG guided FNAC, pleural tap, embolization, etc.)
 */
function extractInvestigationItems(items: NodeListOf<Element>, data: ExtractedSummaryData): void {
    items.forEach(item => {
        const text = item.textContent?.trim() || '';
        const cleanText = cleanInvestigationText(text);
        if (isValidExtractedText(cleanText)) {
            data.investigations.push(cleanText);
        }
    });
}

// ════════════════════════════════════════════════════════════════
//  TEXT CLEANING
// ════════════════════════════════════════════════════════════════

/**
 * Clean raw diagnosis text from the summary page.
 * Strips "Provisional - " or "Final - " prefixes and other noise.
 *
 * HMIS formats:
 *   "Provisional"           → skip (just a label)
 *   "Acute pain due to trauma" → keep
 *   "Provisional - Disc Herniation" → strip prefix → "Disc Herniation"
 */
function cleanDiagnosisText(raw: string): string {
    return raw
        .trim()
        // Remove "Provisional - " / "Final - " prefix
        .replace(/^(Provisional|Final)\s*[-–—:]?\s*/i, '')
        // Remove trailing numbers/codes (with or without leading space)
        .replace(/\)?\d{6,18}\s*$/, '')
        // Remove "View More" button text that may leak in
        .replace(/View More/gi, '')
        // Remove leading/trailing whitespace and dots
        .replace(/^[.·✓✔\s]+|[.·\s]+$/g, '')
        .trim();
}

/**
 * Clean raw investigation/procedure text from the summary page.
 * Strips trailing CPT codes (long numeric suffixes) that HMIS appends.
 *
 * CRITICAL FIX (2026-04-25): HMIS appends digits DIRECTLY to text
 * with NO whitespace separator:
 *   "USG FNAC (Fine Needle Aspiration Cytology)00100000000010005"
 *   "CT Scan Films Charges00100000000076491"
 *
 * The old regex \s*\d{10,18}\s*$ required a space before digits and FAILED.
 * New regex handles both with and without space/paren before digits.
 */
function cleanInvestigationText(raw: string): string {
    return raw
        .trim()
        // Strip trailing 10-18 digit CPT codes — handles NO space before digits
        // Matches: "...Cytology)00100000000010005" or "...Charges00100000000076491"
        .replace(/\)?\d{10,18}\s*$/, '')
        // Strip trailing 5-6 digit CPT codes with separator (e.g., "USG Abdomen - 76700")
        .replace(/\s*[-–]\s*\d{4,6}\s*$/, '')
        // Remove "View More" button text that may leak in
        .replace(/View More/gi, '')
        // Remove specimen/section info that may leak (e.g., "| Special Serum")
        .replace(/\|\s*Special Serum/gi, '')
        .replace(/\|\s*SERUM/gi, '')
        .replace(/\|\s*EDTA.*/gi, '')
        // Remove leading/trailing whitespace, dots, checkmarks
        .replace(/^[.·✓✔\s]+|[.·\s]+$/g, '')
        .trim();
}

/**
 * Check if extracted text is valid (not empty, not too short, not just noise).
 */
function isValidExtractedText(text: string): boolean {
    if (!text || text.length <= 2) return false;

    // Filter out common noise strings
    const noise = [
        'n/a', 'none', 'nil', '--', '-', 'no', 'na',
        'provisional', 'final',                     // bare type labels
        'no result found', 'no results found',       // empty section markers
        'view more',                                  // button text leaking in
    ];
    if (noise.includes(text.toLowerCase())) return false;

    // Filter out strings that are just numbers (residual CPT codes)
    if (/^\d+$/.test(text)) return false;

    return true;
}

/**
 * Check if the text is just a section header (not actual content).
 */
function isHeaderText(text: string): boolean {
    const headers = ['radiology', 'investigation', 'procedure', 'order', 'diagnosis',
                     'pathology', 'medication', 'vitals', 'allergies', 'immunization',
                     'presenting complaints', 'patient summary'];
    const lower = text.toLowerCase();
    return headers.some(h => lower === h || lower === h + ':' || lower === h + 's' || lower === h + 's:');
}
