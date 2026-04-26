/**
 * HMIS Automation Background Service Worker
 *
 * Acts as a relay hub between content scripts and the popup.
 * Stores ephemeral workflow state in chrome.storage.session so the
 * popup can recover state when opened mid-workflow.
 */
console.log('HMIS Automation: Background service worker active.');

interface WorkflowSessionState {
    isRunning: boolean;
    isStopped: boolean;
    currentStep: string;
    statusLog: Array<{ time: string; msg: string; level: string }>;
}

const DEFAULT_SESSION: WorkflowSessionState = {
    isRunning: false,
    isStopped: false,
    currentStep: '',
    statusLog: [],
};

// Initialise session state on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('HMIS Automation extension installed/updated.');
    // Allow content scripts to access session storage
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
    chrome.storage.session.set({ workflowState: DEFAULT_SESSION });
});

/**
 * Forward a message to all extension views (popup, options, etc.)
 * except the sender that originated it.
 */
function forwardToExtensionPages(message: unknown, sender: chrome.runtime.MessageSender) {
    chrome.runtime.sendMessage(message as any).catch(() => {
        // No receivers — popup is closed. That's expected.
    });
}

// --- Message relay: content script → background → popup ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATUS_UPDATE') {
        const { entry, isRunning, isStopped } = message.payload;

        // Persist to session storage so popup can recover on open
        chrome.storage.session?.get('workflowState', (result: Record<string, unknown>) => {
            const state = (result.workflowState as WorkflowSessionState) || { ...DEFAULT_SESSION };
            state.isRunning = isRunning;
            state.isStopped = isStopped;
            state.currentStep = entry.msg;
            state.statusLog.push(entry);

            // Keep bounded
            if (state.statusLog.length > 50) {
                state.statusLog = state.statusLog.slice(-50);
            }

            chrome.storage.session?.set({ workflowState: state });
        });

        // Relay to popup and any other extension pages
        forwardToExtensionPages(message, sender);

        sendResponse({ received: true });
        return true;
    }

    if (message.type === 'STATE_CHANGE') {
        const { isRunning, isStopped, currentStep } = message.payload;

        chrome.storage.session?.get('workflowState', (result: Record<string, unknown>) => {
            const state = (result.workflowState as WorkflowSessionState) || { ...DEFAULT_SESSION };
            state.isRunning = isRunning;
            state.isStopped = isStopped;
            state.currentStep = currentStep || state.currentStep;
            chrome.storage.session?.set({ workflowState: state });
        });

        // Relay to popup and any other extension pages
        forwardToExtensionPages(message, sender);

        sendResponse({ received: true });
        return true;
    }

    // Popup asking for current state
    if (message.type === 'GET_STATE') {
        chrome.storage.session?.get('workflowState', (result: Record<string, unknown>) => {
            sendResponse((result.workflowState as WorkflowSessionState) || DEFAULT_SESSION);
        });
        return true; // async sendResponse
    }

    // Popup requesting to clear the log
    if (message.type === 'CLEAR_LOG') {
        chrome.storage.session?.set({ workflowState: DEFAULT_SESSION });
        sendResponse({ cleared: true });
        return true;
    }

    // --- AI Engine Relay ---
    if (message.type === 'AI_PROGRESS') {
        forwardToExtensionPages(message, sender);
        return false; // No response needed
    }

    if (message.type && message.type.startsWith('AI_') && message.target !== 'ai-offscreen') {
        relayToAI(message)
            .then(response => {
                if (message.type === 'AI_INIT' && response?.status === 'ready') {
                    chrome.storage.local.set({ aiModelDownloaded: true });
                }
                sendResponse(response);
            })
            .catch(err => sendResponse({ error: err.message, status: 'error' }));
        return true; // async
    }

    if (message.type === 'RECORD_UPDATE') {
        // Relay to popup
        forwardToExtensionPages(message, sender);
        sendResponse({ received: true });
        return true;
    }

    if (message.type === 'QUEUE_STATS') {
        // Relay to popup
        forwardToExtensionPages(message, sender);
        sendResponse({ received: true });
        return true;
    }

    if (message.type === 'GET_RECORDS') {
        chrome.storage.local.get('patientRecords', (result) => {
            sendResponse(result.patientRecords || []);
        });
        return true;
    }

    if (message.type === 'CLEAR_RECORDS') {
        chrome.storage.local.set({ patientRecords: [] }, () => {
            sendResponse({ cleared: true });
        });
        return true;
    }
});

// ════════════════════════════════════════════════════════════════
//  AI OFFSCREEN MANAGEMENT
// ════════════════════════════════════════════════════════════════

const OFFSCREEN_PATH = 'src/ai-offscreen.html';

/**
 * Ensure the offscreen document exists and relay message to it.
 */
async function relayToAI(message: any): Promise<any> {
    await setupOffscreenDocument(OFFSCREEN_PATH);
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            ...message,
            target: 'ai-offscreen'
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[Background] Relay failed:', chrome.runtime.lastError.message);
                resolve({ error: chrome.runtime.lastError.message, status: 'error' });
            } else {
                resolve(response);
            }
        });
    });
}

let creating: Promise<void> | null = null;
async function setupOffscreenDocument(path: string) {
    const fullUrl = chrome.runtime.getURL(path);

    // Check if offscreen document already exists
    // Note: getContexts is available in Chrome 116+
    const contexts = await (chrome as any).runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [fullUrl]
    });

    if (contexts.length > 0) {
        return;
    }

    // Create it
    if (creating) {
        await creating;
    } else {
        creating = (chrome as any).offscreen.createDocument({
            url: fullUrl,
            reasons: ['LOCAL_STORAGE'], // Reason for needing a DOM (accessing indexedDB)
            justification: 'AI embedding model execution'
        });
        await creating;
        creating = null;
    }
}

