import { ExtensionConfig } from './types';
import { HMIS_SELECTORS } from './selectors';
import { setLivewireInput } from './livewire-utils';
import { reportStatus } from './state';
import { showToast } from './utils';

/**
 * Automates the login process, including solving the mathematical captcha.
 */
export async function handleLogin(config: Partial<ExtensionConfig>) {
    console.log('HMIS Automation: Handling login page...');
    reportStatus('Login page detected', 'info');

    if (!config.hmisUsername || !config.hmisPassword) {
        console.log('HMIS Automation: No credentials configured. Skipping auto-login.');
        reportStatus('No credentials configured — skipping login', 'error');
        return;
    }

    if (!config.autoLogin) {
        console.log('HMIS Automation: Auto-login disabled in settings.');
        reportStatus('Auto-login disabled', 'info');
        return;
    }

    // --- Error Detection ---
    const errorBanner = document.querySelector(HMIS_SELECTORS.LOGIN.ERROR_BANNER);
    if (errorBanner && errorBanner.textContent?.trim()) {
        const errorMsg = errorBanner.textContent.trim();
        console.error('HMIS Login Error detected:', errorMsg);
        
        if (errorMsg.toLowerCase().includes('already logged in')) {
            reportStatus('Already logged in on another device. Please logout there first.', 'error');
        } else {
            reportStatus(`Login error: ${errorMsg}`, 'error');
        }
        return; // Stop automation if there's a hard error
    }

    // --- Retry Logic ---
    const session = await chrome.storage.session.get('loginAttempts');
    const attempts = (session.loginAttempts as number) || 0;

    if (attempts >= 3) {
        reportStatus('Max login attempts reached (3). Stopping to avoid lockout.', 'error');
        return;
    }

    await chrome.storage.session.set({ loginAttempts: attempts + 1 });

    // 1. Solve Captcha
    reportStatus('Solving captcha...', 'progress');
    solveCaptcha();

    // 2. Fill Hospital
    const hospitalSelect = document.querySelector(HMIS_SELECTORS.LOGIN.HOSPITAL_SELECT) as HTMLSelectElement;
    if (hospitalSelect) {
        setLivewireInput(hospitalSelect, config.hmisHospitalId || '19'); // Default 19 = Lahore General Hospital
        reportStatus('Hospital selected', 'success');
    }

    // 3. Fill Credentials
    const userField = document.querySelector(HMIS_SELECTORS.LOGIN.USERNAME_INPUT) as HTMLInputElement;
    const passField = document.querySelector(HMIS_SELECTORS.LOGIN.PASSWORD_INPUT) as HTMLInputElement;

    if (userField) setLivewireInput(userField, config.hmisUsername);
    if (passField) setLivewireInput(passField, config.hmisPassword);
    reportStatus('Credentials filled', 'success');

    // 4. Submit
    const answerField = document.querySelector(HMIS_SELECTORS.LOGIN.CAPTCHA_ANSWER) as HTMLInputElement;
    if (answerField?.value && userField?.value && passField?.value) {
        console.log('HMIS Automation: All fields filled. Signing in...');
        reportStatus('Submitting login form...', 'progress');
        
        // Let the user see it's logging in
        showToast('Solving captcha & logging in...');
        
        const loginBtn = document.querySelector(HMIS_SELECTORS.LOGIN.SUBMIT_BTN) as HTMLButtonElement;
        if (loginBtn) {
            // Small delay to ensure any JS listeners catch the changes
            setTimeout(() => {
                // Final dynamic check: is auto-login still enabled?
                if (config.autoLogin) {
                    loginBtn.click();
                    reportStatus('Login submitted — waiting for redirect', 'success');
                } else {
                    reportStatus('Auto-login cancelled by user', 'warning');
                }
            }, 500);
        }
    }
}

function solveCaptcha() {
    const num1Field = document.querySelector(HMIS_SELECTORS.LOGIN.CAPTCHA_NUM1) as HTMLInputElement;
    const num2Field = document.querySelector(HMIS_SELECTORS.LOGIN.CAPTCHA_NUM2) as HTMLInputElement;
    const answerField = document.querySelector(HMIS_SELECTORS.LOGIN.CAPTCHA_ANSWER) as HTMLInputElement;

    if (num1Field && num2Field && answerField) {
        const val1 = parseInt(num1Field.value, 10);
        const val2 = parseInt(num2Field.value, 10);

        if (!isNaN(val1) && !isNaN(val2)) {
            // Detect the operator from the DOM label text between the two numbers
            const operator = detectCaptchaOperator();
            let answer: number;
            let opSymbol: string;

            switch (operator) {
                case '-':
                    answer = val1 - val2;
                    opSymbol = '-';
                    break;
                case '*':
                    answer = val1 * val2;
                    opSymbol = '×';
                    break;
                default:
                    answer = val1 + val2;
                    opSymbol = '+';
                    break;
            }

            answerField.value = answer.toString();
            answerField.dispatchEvent(new Event('input', { bubbles: true }));
            reportStatus(`Captcha solved (${val1} ${opSymbol} ${val2} = ${answer})`, 'success');
        }
    }
}

/**
 * Detects the arithmetic operator used in the HMIS captcha.
 * Scans the captcha area's text content for +, -, or × symbols.
 * Defaults to '+' (addition) if no operator is found.
 */
function detectCaptchaOperator(): '+' | '-' | '*' {
    // Look for the label or surrounding text that contains the operator
    const captchaContainer = document.querySelector('.captcha, .captcha-area, form');
    const textContent = captchaContainer?.textContent || '';

    // Check for operator characters between the numbers
    if (textContent.includes('-') && !textContent.includes('+')) return '-';
    if (textContent.includes('×') || textContent.includes('*')) return '*';
    
    // Also check any label element near the answer field
    const label = document.querySelector('label[for="user_answer"], .captcha-text, .captcha-label');
    const labelText = label?.textContent || '';
    if (labelText.includes('-')) return '-';
    if (labelText.includes('×') || labelText.includes('*')) return '*';

    return '+'; // Default to addition
}
