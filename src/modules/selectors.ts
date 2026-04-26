/**
 * HMIS Selectors - Centralized for easy maintenance
 *
 * Verified against live HMIS DOM on 2026-04-25.
 * See docs/hmis-reference.md for full verification details.
 */
export const HMIS_SELECTORS = {
    // 1. Login Page
    LOGIN: {
        HOSPITAL_SELECT: '#hospitalId',
        USERNAME_INPUT: '#username',
        PASSWORD_INPUT: '#password',
        CAPTCHA_NUM1: 'input[name="num1"]',
        CAPTCHA_NUM2: 'input[name="num2"]',
        CAPTCHA_ANSWER: 'input[name="user_answer"]',
        SUBMIT_BTN: 'button[type="submit"]',
        ERROR_BANNER: '.alert.alert-danger, .alert.alert-warning, .text-danger',
        VALIDATION_ERROR: '.invalid-feedback, .error-message'
    },

    // 2. Department / Role Settings
    DEPARTMENT: {
        DEPT_SELECT: 'select[wire\\:model\\.defer="departmentId"]',
        CLINIC_SELECT: 'select[wire\\:model\\.defer="clinicId"]',
        NEXT_BTN: 'button[wire\\:click="loadDepartment"]'
    },

    // 3. Dashboard (Token Listing) — ✅ Verified
    DASHBOARD: {
        PATIENT_TABLE: '.right_col table tbody',
        ANY_PATIENT_LINK: 'a[id^="tokenPatButton_"], a[id^="tokenArrowButton_"]',
        // Token call button — HMIS uses <a id="newPatientBtn">, not a wire:click button
        REFRESH_BTN: '#newPatientBtn, a[id="newPatientBtn"]',
        EMPTY_QUEUE_INDICATOR: '.dataTables_empty'
    },

    // 4. Patient Side Menu
    // ⚠️ HMIS sidebar links use href="javascript:void(0)" with wire:click.
    // href*= selectors DO NOT WORK. navigateToTab() uses findByText() as
    // the reliable fallback — these CSS selectors are best-effort only.
    SIDE_MENU: {
        // Text labels to match via findByText() (used by navigateToTab fallback)
        SUMMARY_TEXT: 'Summary',
        COMPLAINTS_TEXT: 'Complaints',
        DIAGNOSIS_TEXT: 'Diagnosis',
        ORDER_TEXT: 'Order',
        INVESTIGATION_SUBTAB: '#order-investigation-tab'
    },

    // 5. Form Elements
    COMPLAINT: {
        DROPDOWN: 'button.dropdown-toggle[title="Select Complaint"]',
        DROPDOWN_SEARCH: '.bs-searchbox input',
        SAVE_BTN: 'button.btn-teal2'
    },
    DIAGNOSIS: {
        TYPE_SELECT: 'select.sl_template1',
        QUERY_INPUT: 'input.form-input.sl_template2[placeholder="Search Diagnosis..."]',
        LIST_ITEM: 'a.list-item',
        SAVE_BTN: 'button.btn-teal2'
    },
    INVESTIGATION: {
        QUERY_INPUT: 'input.form-input.sl_template2[placeholder="Search CPT..."]',
        LIST_ITEM: 'a.list-item',
        SAVE_BTN: 'button.btn-teal2'
    },

    // 6. Checkout & Navigation — ✅ Verified
    NAV: {
        CHECKOUT_BTN: '.btn-patient-checkout',
        HOME_BTN: 'a[href*="resetTokenHomeButton"]',
        SWITCH_ROLE: '.login-roles-list .dropdown-toggle',
        ROLE_OPD_ID: '1073'
    },

    // 7. Summary Extraction — Fixed: added col-md-6 containers
    SUMMARY: {
        CARDS: '.card, .panel, .section, .col-md-6',
        CARD_HEADER: 'h4, h5, h6, .card-header, strong, .section-title',
        ITEM_TEXT: 'p, li, span, .item-text, .summary-item'
    },

    // 8. Patient Demographics & Info
    // ⚠️ HMIS does NOT use dedicated classes for patient info fields.
    // Patient info is in a flat text bar: "Name: X | MRN: Y | Age: Z"
    // The INFO_BAR selector targets the container; extraction uses regex.
    PATIENT_INFO: {
        INFO_BAR: '.x_content, .patient-info-bar, [class*="patient"]',
    },

    // 9. Vitals Section
    VITALS: {
        CONTAINER: '.vitals-card, [class*="vital"], .vitals-section',
        BP: '.vitals-bp, [class*="blood"], [class*="bp"]',
        PULSE: '.vitals-pulse, [class*="pulse"], .heart-rate',
        TEMP: '.vitals-temp, [class*="temp"], .temperature',
        WEIGHT: '[class*="weight"], .patient-weight'
    },

    // 10. Clinical Data Sections
    CLINICAL: {
        COMPLAINTS: '#complaints-component, [class*="complaint"], .complaints-section',
        MEDICATIONS: '#medication-component, [class*="medicine"], .medications-section',
        ALLERGIES: '[class*="allergy"], .alert-danger, .allergies-section'
    }
};
