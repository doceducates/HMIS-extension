/**
 * Summary Extractor — Extracts diagnosis and investigation data from the
 * HMIS patient encounter Summary tab.
 *
 * The Summary page uses card-based sections with headings. This module
 * tries multiple extraction strategies for resilience against HMIS UI changes.
 *
 * Real-world patterns from radiology practice:
 *   - Some patients have NO provisional diagnosis on summary
 *   - Some patients have 2+ provisional diagnoses
 *   - Radiology section may list imaging (USG Abdomen) OR procedures
 *     (USG guided FNAC, pleural tap, embolization) or nothing at all
 *   - Items often have trailing CPT codes (18-digit numbers) that must be stripped
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

    // Strategy 1: Card-based extraction (primary, proven pattern)
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
 * Strategy 1: Find `.card` / `.panel` / `.section` elements and check
 * their headings for "Diagnosis" or "Radiology".
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
        const parent = h.closest('.card') || h.parentElement;
        if (!parent) return;

        const contentItems = parent.querySelectorAll('p, li, .item-text, .summary-item, span.badge');

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
 */
function cleanDiagnosisText(raw: string): string {
    return raw
        .trim()
        // Remove "Provisional - " / "Final - " prefix
        .replace(/^(Provisional|Final)\s*[-–—:]\s*/i, '')
        // Remove trailing numbers/codes
        .replace(/\s*\d{6,18}\s*$/, '')
        // Remove leading/trailing whitespace and dots
        .replace(/^[.\s]+|[.\s]+$/g, '')
        .trim();
}

/**
 * Clean raw investigation/procedure text from the summary page.
 * Strips trailing CPT codes (long numeric suffixes) that HMIS appends.
 */
function cleanInvestigationText(raw: string): string {
    return raw
        .trim()
        // Strip trailing 10-18 digit CPT codes (e.g., "USG Abdomen001000...")
        .replace(/\s*\d{10,18}\s*$/, '')
        // Strip trailing 5-6 digit CPT codes with separator (e.g., "USG Abdomen - 76700")
        .replace(/\s*[-–]\s*\d{4,6}\s*$/, '')
        // Remove leading/trailing whitespace and dots
        .replace(/^[.\s]+|[.\s]+$/g, '')
        .trim();
}

/**
 * Check if extracted text is valid (not empty, not too short, not just noise).
 */
function isValidExtractedText(text: string): boolean {
    if (!text || text.length <= 2) return false;

    // Filter out common noise strings
    const noise = ['n/a', 'none', 'nil', '--', '-', 'no', 'na'];
    if (noise.includes(text.toLowerCase())) return false;

    return true;
}

/**
 * Check if the text is just a section header (not actual content).
 */
function isHeaderText(text: string): boolean {
    const headers = ['radiology', 'investigation', 'procedure', 'order', 'diagnosis'];
    const lower = text.toLowerCase();
    return headers.some(h => lower === h || lower === h + ':' || lower === h + 's' || lower === h + 's:');
}
