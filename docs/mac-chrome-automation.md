# macOS Chrome Automation & Screenshot Setup

This guide details exactly how to configure Google Chrome and macOS to allow AI agents or CLI scripts to automate browser pages, log in, and take screenshots directly on your Mac.

---

## 1. Connect to Chrome via CDP (Highly Recommended)
By default, Chrome does not listen to external automation scripts. To allow scripts (like Playwright, Puppeteer, or MCP servers) to connect to your active Chrome browser window and use your existing login session:

1. **Quit Chrome completely** (Cmd + Q).
2. **Launch Chrome with debugging enabled** from your terminal:
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```
3. Now, any automation script can connect directly using the browser debugger endpoint `http://localhost:9222`:
   ```javascript
   import { chromium } from 'playwright';
   const browser = await chromium.connectOverCDP('http://localhost:9222');
   ```

---

## 2. Enable JavaScript Execution via AppleScript
If you want to automate page interaction via macOS AppleScript:
1. Open Google Chrome.
2. In the menu bar, go to **View > Developer > Allow JavaScript from Apple Events**.
3. If unchecked, running JavaScript inside tab elements will throw security error `12`.

---

## 3. Enable Keystroke Simulation (Accessibility)
If you want scripts to be able to type credentials or simulate keyboard inputs:
1. Go to **macOS System Settings > Privacy & Security > Accessibility**.
2. Click the `+` button and add your Terminal (e.g., Terminal, iTerm2) or IDE (e.g., VS Code / Antigravity IDE).
3. If disabled, AppleScript's `System Events keystroke` command will fail with error `1002`.

---

## 4. Take Screen Captures Directly
If remote automation is blocked, you can force Chrome to the front and take a screenshot of your screen:
```bash
# Bring Chrome to the front
osascript -e 'tell application "Google Chrome" to activate'
# Wait 1 second and capture screen
sleep 1 && screencapture -x screenshot.png
```
