/**
 * AI Engine — Public API for the AI embedding model.
 *
 * Provides a clean interface for other modules (clinical-rules.ts, popup.ts)
 * to request AI-powered suggestions. Communicates with the offscreen document
 * via chrome.runtime messaging through the background service worker.
 *
 * Usage:
 *   import { suggestDiagnoses, suggestInvestigations, getAIStatus } from './ai-engine';
 *   const suggestions = await suggestDiagnoses("bilateral pleural thickening");
 *   // → [{ code: "J94.0", label: "Pleural thickening", score: 0.82 }, ...]
 */

// ════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════

export interface AISuggestion {
    code: string;
    label: string;
    score: number;
}

export type AIStatus = 'loading' | 'ready' | 'error' | 'disabled' | 'uninstalled' | 'downloading';

// ════════════════════════════════════════════════════════════════
//  PUBLIC API
// ════════════════════════════════════════════════════════════════

/**
 * Initialize the AI engine. Should be called once when the user
 * enables AI assist. Creates the offscreen document and loads the model.
 */
export async function initAI(): Promise<AIStatus> {
    try {
        const response = await sendToBackground({
            type: 'AI_INIT',
        });
        return response?.status || 'error';
    } catch (err) {
        console.error('[AI Engine] Init failed:', err);
        return 'error';
    }
}

/**
 * Get the current status of the AI engine.
 */
export async function getAIStatus(): Promise<AIStatus> {
    try {
        const response = await sendToBackground({
            type: 'AI_STATUS',
        });
        const status = response?.status || 'disabled';

        // If background says disabled or loading, but we haven't downloaded the model yet,
        // show as uninstalled so the UI can prompt for download.
        if (status === 'disabled' || status === 'loading' || status === 'error') {
            const storage = await chrome.storage.local.get('aiModelDownloaded');
            if (!storage.aiModelDownloaded) {
                return 'uninstalled';
            }
        }

        return status;
    } catch {
        // Fallback to storage check if background is not responsive
        const storage = await chrome.storage.local.get('aiModelDownloaded');
        return storage.aiModelDownloaded ? 'disabled' : 'uninstalled';
    }
}

/**
 * Suggest ICD-10 diagnosis codes for the given patient text.
 *
 * @param text     Patient summary text (complaints, symptoms, etc.)
 * @param topN     Number of suggestions to return (default: 5)
 * @param minScore Minimum cosine similarity score (default: 0.3)
 * @returns        Ranked list of diagnosis suggestions
 */
export async function suggestDiagnoses(
    text: string,
    topN = 5,
    minScore = 0.3
): Promise<AISuggestion[]> {
    if (!text || text.trim().length < 3) return [];

    try {
        const response = await sendToBackground({
            type: 'AI_QUERY_DIAGNOSIS',
            payload: { text: text.trim(), topN, minScore },
        });
        return response?.results || [];
    } catch (err) {
        console.error('[AI Engine] Diagnosis query failed:', err);
        return [];
    }
}

/**
 * Suggest CPT investigation/procedure codes for the given text.
 *
 * @param text     Diagnosis text or clinical description
 * @param topN     Number of suggestions to return (default: 5)
 * @param minScore Minimum cosine similarity score (default: 0.3)
 * @returns        Ranked list of investigation suggestions
 */
export async function suggestInvestigations(
    text: string,
    topN = 5,
    minScore = 0.3
): Promise<AISuggestion[]> {
    if (!text || text.trim().length < 3) return [];

    try {
        const response = await sendToBackground({
            type: 'AI_QUERY_INVESTIGATION',
            payload: { text: text.trim(), topN, minScore },
        });
        return response?.results || [];
    } catch (err) {
        console.error('[AI Engine] Investigation query failed:', err);
        return [];
    }
}

// ════════════════════════════════════════════════════════════════
//  INTERNAL MESSAGING
// ════════════════════════════════════════════════════════════════

/**
 * Send a message to the background service worker, which relays
 * it to the AI offscreen document.
 */
function sendToBackground(message: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}
