# Privacy Policy for 极简选区扫码 (Minimalist Selection QR Scanner)

**Last Updated: 2026-04-07**

This extension is designed to be a serverless, privacy-first tool.

### 1. Data Collection
We **DO NOT** collect, store, or transmit any personal information, browsing history, or user data to any external servers.

### 2. Permissions Justification
- **activeTab & scripting**: Used solely to inject the selection overlay so you can select a QR code on the current page.
- **offscreen**: Used to process image pixels and decode QR codes locally in a secure, isolated environment.
- **clipboardWrite**: Used only to copy the decoded text result to your clipboard for your convenience.
- **host_permissions (<all_urls>)**: Necessary to access image data across different websites to ensure QR code detection works on any page you visit.

### 3. Local Processing
All image cropping and QR code decoding are performed **locally** within your browser. No image data ever leaves your device.

### 4. Third-Party Sharing
Since we do not collect any data, we do not share any information with third parties.