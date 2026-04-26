/**
 * Centralized workflow state and status broadcasting.
 *
 * Content scripts call reportStatus() to push live updates through
 * the background service worker to any open popup.
 */

export type StatusLevel = 'info' | 'success' | 'error' | 'progress' | 'warning';

export interface StatusEntry {
    time: string;
    msg: string;
    level: StatusLevel;
}

export const WorkflowState = {
    isRunning: false,
    isStopped: false,
    currentStep: '',
    statusLog: [] as StatusEntry[],
};

/**
 * Sets the running state and broadcasts it to the popup.
 */
export function setRunning(running: boolean) {
    WorkflowState.isRunning = running;
    if (running) WorkflowState.isStopped = false;
    broadcastState();
}

/**
 * Broadcasts a status update to the background script (which relays to the popup)
 * and stores it locally in the content-script's state.
 */
export function reportStatus(msg: string, level: StatusLevel = 'info') {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour12: false });

    const entry: StatusEntry = { time, msg, level };

    WorkflowState.currentStep = msg;
    WorkflowState.statusLog.push(entry);

    // Keep log bounded to last 50 entries
    if (WorkflowState.statusLog.length > 50) {
        WorkflowState.statusLog.shift();
    }

    console.log(`HMIS [${level.toUpperCase()}]: ${msg}`);

    // Broadcast to background → popup
    try {
        chrome.runtime.sendMessage({
            type: 'STATUS_UPDATE',
            payload: {
                entry,
                isRunning: WorkflowState.isRunning,
                isStopped: WorkflowState.isStopped,
            },
        });
    } catch {
        // Popup or background may not be listening — that's fine
    }
}

/**
 * Broadcasts a state change (running/stopped) without a log entry.
 */
export function broadcastState() {
    try {
        chrome.runtime.sendMessage({
            type: 'STATE_CHANGE',
            payload: {
                isRunning: WorkflowState.isRunning,
                isStopped: WorkflowState.isStopped,
                currentStep: WorkflowState.currentStep,
            },
        });
    } catch {
        // silent
    }
}

/**
 * Broadcasts a patient record update to the background script
 */
export function broadcastRecordUpdate(record: any) {
    try {
        chrome.runtime.sendMessage({
            type: 'RECORD_UPDATE',
            payload: record,
        });
    } catch {
        // silent
    }
}

/**
 * Broadcasts queue statistics (remaining patients) to the background script
 */
export function broadcastQueueStats(stats: { totalCount: number }) {
    try {
        chrome.runtime.sendMessage({
            type: 'QUEUE_STATS',
            payload: stats,
        });
    } catch {
        // silent
    }
}
