/**
 * Patient Records Management
 *
 * Handles saving, retrieving, and pruning patient processing records.
 * Only keeps records for the current day to minimize storage use.
 */

import { PatientRecord, SessionStats } from './types';

const STORAGE_KEY = 'patientRecords';

/**
 * Retrieves all patient records, optionally filtering by date
 */
export async function getPatientRecords(dateFilter: string = new Date().toISOString().split('T')[0]): Promise<PatientRecord[]> {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const records: PatientRecord[] = (data[STORAGE_KEY] as PatientRecord[]) || [];
    
    if (dateFilter) {
        return records.filter(r => r.timestamp.startsWith(dateFilter));
    }
    return records;
}

/**
 * Saves or updates a patient record. Also automatically prunes old records.
 */
export async function savePatientRecord(record: PatientRecord): Promise<void> {
    await pruneOldRecords(); // Ensure we only keep today's records
    
    const data = await chrome.storage.local.get(STORAGE_KEY);
    let records: PatientRecord[] = (data[STORAGE_KEY] as PatientRecord[]) || [];
    
    // Update existing or add new
    const existingIndex = records.findIndex(r => r.id === record.id);
    if (existingIndex >= 0) {
        records[existingIndex] = record;
    } else {
        records.push(record);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEY]: records });
}

/**
 * Prunes records that are NOT from today (local time).
 * This ensures we don't build up stale data in local storage.
 */
export async function pruneOldRecords(): Promise<void> {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    let records: PatientRecord[] = (data[STORAGE_KEY] as PatientRecord[]) || [];
    
    if (records.length === 0) return;
    
    const today = new Date().toISOString().split('T')[0];
    const originalLength = records.length;
    
    // Keep only today's records
    records = records.filter(r => r.timestamp.startsWith(today));
    
    if (records.length !== originalLength) {
        await chrome.storage.local.set({ [STORAGE_KEY]: records });
        console.log(`Pruned ${originalLength - records.length} old patient records.`);
    }
}

/**
 * Clears ALL patient records from storage
 */
export async function clearAllRecords(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}

/**
 * Gets aggregated session statistics for the current day
 */
export async function getSessionStats(): Promise<SessionStats> {
    const today = new Date().toISOString().split('T')[0];
    const records = await getPatientRecords(today);
    
    let successCount = 0;
    let errorCount = 0;
    let partialCount = 0;
    let skippedCount = 0;
    let totalDurationMs = 0;
    
    for (const r of records) {
        if (r.status === 'success') successCount++;
        else if (r.status === 'error') errorCount++;
        else if (r.status === 'partial') partialCount++;
        else if (r.status === 'skipped') skippedCount++;
        
        totalDurationMs += (r.durationMs || 0);
    }
    
    const totalProcessed = records.length;
    const avgDurationMs = totalProcessed > 0 ? Math.round(totalDurationMs / totalProcessed) : 0;
    
    return {
        totalProcessed,
        successCount,
        errorCount,
        partialCount,
        skippedCount,
        avgDurationMs,
        sessionStartedAt: today
    };
}
