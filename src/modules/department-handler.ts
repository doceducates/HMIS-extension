import { ExtensionConfig } from './types';
import { HMIS_SELECTORS } from './selectors';
import { setLivewireInput, waitForLivewire, waitForElement } from './livewire-utils';
import { showToast } from './utils';
import { reportStatus } from './state';

/**
 * Automates the Department and Clinic selection on the /login/settings page.
 * This runs on the Livewire-powered department picker page after login.
 */
export async function handleDepartmentSelection(config: Partial<ExtensionConfig>) {
    // --- Setup Lock ---
    const session = await chrome.storage.session.get('setupCompleted');
    if (session.setupCompleted && (window.location.pathname.includes('/token/today') || window.location.pathname.includes('/radiology/'))) {
        console.log('HMIS Automation: Department already configured.');
        return;
    }

    console.log('HMIS Automation: Handling department selection...');
    reportStatus('Department selection page detected', 'info');
    showToast('Selecting Department & Clinic...');

    if (!config.autoDepartment) {
        showToast('Please select your Department/Role manually.');
        reportStatus('Auto-department disabled — manual selection required', 'info');
        return;
    }

    const deptId = config.hmisDepartmentId || '1'; // 1 = OPD
    const clinicId = config.hmisClinicId || '1503'; // 1503 = Interventional Radiology Clinic

    try {
        // Wait for element to exist (up to 10s) in case Livewire injects it late
        reportStatus('Waiting for department dropdown...', 'progress');
        const deptSelect = (await waitForElement(HMIS_SELECTORS.DEPARTMENT.DEPT_SELECT, 10000)) as HTMLSelectElement;

        if (deptSelect) {
            console.log(`Setting department to ${deptId}`);
            setLivewireInput(deptSelect, deptId);
            reportStatus(`Department set (ID: ${deptId})`, 'success');

            // Wait for Livewire to respond and load clinics
            await waitForLivewire(3000);

            // 2. Select Clinic
            reportStatus('Selecting clinic...', 'progress');
            if (!config.autoDepartment) return; // Dynamic check

            const clinicSelect = (await waitForElement(HMIS_SELECTORS.DEPARTMENT.CLINIC_SELECT, 5000)) as HTMLSelectElement;
            if (clinicSelect) {
                console.log(`Setting clinic to ${clinicId}`);
                setLivewireInput(clinicSelect, clinicId);
                await waitForLivewire(1500);
                reportStatus(`Clinic set (ID: ${clinicId})`, 'success');
            }

            // 3. Click Next
            setTimeout(() => {
                if (!config.autoDepartment) return; // Dynamic check

                const nextBtn = document.querySelector(HMIS_SELECTORS.DEPARTMENT.NEXT_BTN) as HTMLElement;
                if (nextBtn) {
                    console.log('Clicking Next to proceed to dashboard');
                    nextBtn.click();
                    reportStatus('Navigating to dashboard...', 'progress');
                } else {
                    console.warn('Next button not found');
                    showToast('Could not find Next button. Please click it manually.', true);
                    reportStatus('Next button not found — click manually', 'error');
                }
            }, 800);

        } else {
            console.warn('HMIS Automation: Department dropdown not found.');
            showToast('Department dropdown not found. Check selectors.', true);
            reportStatus('Department dropdown not found', 'error');
        }

    } catch (err) {
        console.error('Error during auto department selection:', err);
        showToast('Auto-selection failed. Please select manually.', true);
        reportStatus('Department selection failed', 'error');
    }
}

/**
 * Checks the current active role shown in the header and switches to the
 * configured OPD role if it doesn't match. This runs on the main dashboard.
 *
 * HMIS shows the currently active role via a dropdown in the top nav.
 * When you switch role, it calls a Livewire action "saveCurrentRole" which
 * reloads the page into the new role context.
 */
export async function handleRoleSelection(config: Partial<ExtensionConfig>) {
    if (!config.autoDepartment) {
        console.log('HMIS Automation: Auto role-switch disabled.');
        return;
    }

    // --- Setup Lock ---
    // If setup is already done this session, skip role switching entirely.
    // This prevents infinite loops when patient encounter URLs also contain '/token/'.
    const session = await chrome.storage.session.get('setupCompleted');
    if (session.setupCompleted) {
        console.log('HMIS Automation: Setup already completed for this session.');
        return;
    }

    console.log('HMIS Automation: Checking active role in header...');
    reportStatus('Checking active role...', 'progress');

    // The role toggle button shows the current active role name in the header
    const roleToggle = document.querySelector(HMIS_SELECTORS.NAV.SWITCH_ROLE) as HTMLElement;
    if (!roleToggle) {
        console.log('HMIS Automation: Role switcher not found on this page.');
        reportStatus('Role switcher not found', 'info');
        return;
    }

    const currentRoleText = roleToggle.textContent?.trim().toLowerCase() || '';
    console.log('Current role text:', currentRoleText);

    // If already in OPD context or on the token page, skip switching
    if (
        currentRoleText.includes('opd') || 
        currentRoleText.includes('out patient') ||
        window.location.pathname.includes('/token/today')
    ) {
        console.log('HMIS Automation: Already in correct context. No switch needed.');
        reportStatus('Already in OPD context ✓', 'success');
        await chrome.storage.session.set({ setupCompleted: true });
        return;
    }

    // Need to switch roles — open the dropdown first
    reportStatus('Switching to OPD role...', 'progress');
    showToast('Switching to OPD role...');
    roleToggle.click();

    // Wait for the dropdown menu to appear
    await new Promise<void>(resolve => setTimeout(resolve, 600));

    // Find the OPD role link. Try to find by configured role ID first, then fallback to text match.
    const roleId = config.hmisRoleId || '';
    let roleLink: HTMLElement | null = null;

    if (roleId) {
        // Try selector with specific role ID in wire:click attribute
        roleLink = document.querySelector(`a[wire\\:click*="saveCurrentRole"][wire\\:click*="${roleId}"]`) as HTMLElement;
        // Also try as href
        if (!roleLink) {
            roleLink = document.querySelector(`a[href*="${roleId}"]`) as HTMLElement;
        }
    }

    // Fallback: find any role link whose text contains "OPD" or "out patient"
    if (!roleLink) {
        const allRoleLinks = document.querySelectorAll<HTMLElement>(
            '.login-roles-list .dropdown-menu a, .login-roles-list li a, .dropdown-menu .dropdown-item'
        );
        for (const link of allRoleLinks) {
            const text = link.textContent?.trim().toLowerCase() || '';
            if (text.includes('opd') || text.includes('out patient') || text.includes('outpatient')) {
                roleLink = link;
                console.log('Found OPD role link by text:', link.textContent?.trim());
                break;
            }
        }
    }

    if (roleLink) {
        console.log('HMIS Automation: Clicking OPD role link...');
        roleLink.click();
        reportStatus('OPD role selected — reloading...', 'success');
        // We don't set setupCompleted here because the page will reload. 
        // On next load, the /token/today check will catch it.
    } else {
        showToast('Could not find OPD role option. Please switch manually.', true);
        reportStatus('OPD role not found — switch manually', 'error');
        console.warn('HMIS Automation: OPD role link not found in dropdown.');
        // Close the dropdown we opened
        roleToggle.click();
    }
}
