/**
 * HMIS Selectors - Centralized for easy maintenance
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

    // 3. Dashboard (Token Listing)
    DASHBOARD: {
        PATIENT_TABLE: '.right_col table tbody',
        ANY_PATIENT_LINK: 'a[id^="tokenPatButton_"], a[id^="tokenArrowButton_"]',
        REFRESH_BTN: 'button[wire\\:click="getTokenData"]',
        EMPTY_QUEUE_INDICATOR: '.dataTables_empty'
    },

    // 4. Patient Side Menu
    SIDE_MENU: {
        SUMMARY: 'a[href*="summary"], li:nth-child(1) a.nav-link', // Usually first tab
        COMPLAINTS: 'a[href*="complaint"], li:nth-child(2) a.nav-link',
        DIAGNOSIS: 'a[href*="diagnosis"], li:nth-child(3) a.nav-link',
        ORDER: 'a[href*="order"], li:nth-child(4) a.nav-link',
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

    // 6. Checkout & Navigation
    NAV: {
        CHECKOUT_BTN: '.btn-patient-checkout',
        HOME_BTN: 'a[href*="resetTokenHomeButton"]',
        SWITCH_ROLE: '.login-roles-list .dropdown-toggle',
        ROLE_OPD_ID: '1073'
    },

    // 7. Summary Extraction
    SUMMARY: {
        CARDS: '.card, .panel, .section',
        CARD_HEADER: 'h4, h5, h6, .card-header, strong, .section-title',
        ITEM_TEXT: 'p, li, .item-text, .summary-item'
    },

    // 8. Patient Demographics & Info
    PATIENT_INFO: {
        NAME: '.patient-name, [class*="patient"] .name, h4.patient-name',
        MRN: '#mrn, [id*="mrn"], [class*="mrn"]',
        AGE: '[class*="age"], .patient-age',
        GENDER: '[class*="gender"], .patient-gender'
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
