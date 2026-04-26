# 🤖 HMIS Autopilot

![Version](https://img.shields.io/badge/version-1.3.1-cyan?style=for-the-badge)
![Status](https://img.shields.io/badge/status-Elite-purple?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Chrome-blue?style=for-the-badge)

**HMIS Autopilot** is a high-performance browser extension designed to eliminate the repetitive manual workflows of the HMIS Punjab portal. Built by a radiologist for healthcare professionals, it leverages intelligent automation and AI to streamline patient processing.

---

## ✨ Key Features

### 🏥 Workflow Automation
- **Auto Login**: Remembers credentials and automatically solves captcha.
- **Auto Department**: Instantly selects your department and clinic roles.
- **Auto Pilot**: Fills patient encounter forms (Complaints, Diagnosis, Investigations) based on clinical rules or your previous defaults.
- **Auto Checkout**: Closes the encounter automatically after saving.

### 🧠 Intelligent Assistance
- **AI Assist (Tier 2)**: Powered by HuggingFace Transformers, providing smart suggestions for missing diagnosis or investigations based on patient complaints.
- **Live Queue**: Real-time extraction of the patient dashboard for one-click processing.
- **Records Tracking**: Keeps a daily log of processed patients and automation success rates.

### 💎 Elite UI/UX
- **Glassmorphic Interface**: A modern, dark-mode dashboard with premium glassmorphic aesthetics.
- **Holographic Branding**: Features an animated holographic signature and a pulsing ⚡ heartbeat engine.
- **The Clinical Bot**: Friendly AI persona guiding your workflow.

---

## 🛠️ Development & Installation

### 🔧 Prerequisites
- Node.js (v22+)
- npm

### 📥 Local Setup
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### 🔨 Commands
- `npm run dev`: Start Vite development server (HMR for extension pages).
- `npm run build`: Compile TypeScript and build the extension into `dist/`.
- `npm run pack`: Build and package a signed `.crx` extension using your local `HMIS.pem` key.

### 📦 Installation in Chrome
1. Go to `chrome://extensions/`.
2. Enable **Developer Mode** (top right).
3. Click **Load unpacked** and select the `dist/` folder.
*Or drag and drop the `HMIS-Autopilot.crx` from the `dist/` folder.*

---

## 🚀 CI/CD & Automated Releases

The project includes a GitHub Actions workflow that automatically handles releases.

### 🔑 Secret Setup
To enable signed CRX releases in GitHub, add your `.pem` key as a secret:
1. Repository Settings → **Secrets and variables** → **Actions**.
2. Create a secret named `EXTENSION_KEY`.
3. Paste the content of your `HMIS.pem`.

### 🏷️ Creating a Release
Whenever you push a version tag, GitHub will build and attach the assets:
```bash
git tag v1.3.1
git push origin v1.3.1
```

---

## 👨‍⚕️ Creator
**Dr. Mudassir**  
*Resident Radiologist, Lahore General Hospital (LGH)*  
*Workflow Automation & AI Specialist*

---

## ⚖️ License
© 2026 Dr. Mudassir. All rights reserved. Built for Clinical Excellence.
