# TruthScope Extension Component Interaction

This document outlines the communication flow between the main JavaScript components of the TruthScope Chrome Extension: `background.js`, `content.js`, `popup.js`, and `sidepanel.js`.

**Core Components:**

*   **`background.js` (Service Worker):**
    *   **Role:** Acts as the central event handler and communication hub. Runs persistently (or is activated when needed) in the background.
    *   **Responsibilities:**
        *   Handles communication with the external backend Flask API (`/check` for analysis, `/news` for related news).
        *   Manages long-running tasks (API calls).
        *   Processes analysis results received from the backend.
        *   Manages extension state, primarily by storing the latest analysis results (`lastAnalysis`) in `chrome.storage.local`.
        *   Routes messages between other components (`popup.js`, `content.js`, `sidepanel.js`) using `chrome.runtime.onMessage`.
        *   Creates desktop notifications (`chrome.notifications.create`) upon analysis completion or errors.
        *   Responds to "ping" messages to confirm it's active.

*   **`content.js`:**
    *   **Role:** Injected into web pages the user visits (as defined by `matches` in `manifest.json`).
    *   **Responsibilities:**
        *   Directly interacts with the Document Object Model (DOM) of the web page.
        *   Determines if the current page is likely an article (`isArticlePage`).
        *   Extracts the main text content from the page (`extractArticleContent`).
        *   Sends the extracted text to `background.js` for analysis (`chrome.runtime.sendMessage({ action: "analyzeText", ... })`) upon page load or when requested by the popup.
        *   Listens for text selection events (`mouseup`, `keyup`) and stores the `lastSelection` (though currently not automatically analyzed).
        *   Responds to messages from `popup.js` (`chrome.runtime.onMessage`), specifically `getSelectedText` and `analyzeContent` (triggering extraction and sending to background).
        *   Stores the analysis result received *indirectly* via `background.js` into `chrome.storage.local` (`safeStorageSet({ lastAnalysis: ... })`) after the background script completes the analysis.
        *   Includes keep-alive pings to the background script.

*   **`popup.js`:**
    *   **Role:** Runs when the user clicks the extension's icon in the toolbar (`popup.html`). Provides a quick-view interface.
    *   **Responsibilities:**
        *   Initializes the popup UI (`initializePopup`).
        *   Checks if `background.js` is ready (`ensureBackgroundScriptReady`).
        *   Reads the `lastAnalysis` from `chrome.storage.local.get` to display the status for the *current active tab's URL*.
        *   If the stored analysis matches the current URL, updates the UI (`updateUI`).
        *   If no relevant analysis is found in storage for the current URL *or* the URL doesn't match, it requests a *new* analysis by sending a message (`{ action: 'analyzeContent' }`) to the `content.js` of the active tab (`chrome.tabs.sendMessage`).
        *   Listens for changes in `chrome.storage` (`chrome.storage.onChanged`) to update the UI in real-time if the analysis completes or the theme changes while the popup is open.
        *   Handles the "View Details" button click (`actionButton`) to open the side panel for the current tab using `chrome.sidePanel.open`.
        *   Manages its own theme based on `chrome.storage.local` (`initializeTheme`, `applyTheme`).

*   **`sidepanel.js`:**
    *   **Role:** Runs within the dedicated side panel UI (`sidepanel.html`). Displays detailed analysis results.
    *   **Responsibilities:**
        *   Initializes the side panel UI (`DOMContentLoaded`).
        *   Reads the `lastAnalysis` from `chrome.storage.local.get` (`loadInitialData`) and displays the detailed results (`displayAnalysisResult`), including status, confidence, and fact-checks.
        *   If `lastAnalysis` contains text, it sends a message to `background.js` (`chrome.runtime.sendMessage({ action: "getNews", ... })`) to fetch related news.
        *   Renders the news results received from `background.js` (`renderNewsResults`).
        *   Listens for changes in `chrome.storage` (`chrome.storage.onChanged`) to update the displayed analysis (`lastAnalysis`) or theme if they change while the panel is open.
        *   Handles theme switching (`initializeTheme`, `cycleTheme`, `applyThemeUI`). It reads the theme from storage and *writes* theme changes back to storage, synchronizing with the popup.

**Interaction Flows & Communication Channels:**

1.  **Page Load Analysis:**
    *   `content.js` (on load): Detects article -> Extracts text.
    *   `content.js` -> `background.js`: `chrome.runtime.sendMessage({ action: "analyzeText", data: text })`
    *   `background.js`: Receives text -> Calls Backend API (`/check`).
    *   Backend API -> `background.js`: Returns analysis JSON (`label`, `score`, `fact_check`).
    *   `background.js`: Stores result in `chrome.storage.local.set({ lastAnalysis: { ...result, url, text, timestamp } })`.
    *   `background.js`: Creates `chrome.notifications.create`.
    *   `popup.js` / `sidepanel.js` (if open): `chrome.storage.onChanged` listener detects `lastAnalysis` change -> Updates UI.

2.  **Popup Interaction & Re-Analysis Trigger:**
    *   User clicks extension icon.
    *   `popup.js`: Initializes -> Reads `chrome.storage.local.get(['lastAnalysis'])`.
    *   `popup.js`: Compares stored `lastAnalysis.url` with current `tab.url`.
        *   **Match:** `updateUI` with stored status.
        *   **No Match / No Data:** `popup.js` -> `content.js` (active tab): `chrome.tabs.sendMessage(tabId, { action: 'analyzeContent' })`.
    *   `content.js`: Receives `analyzeContent` -> Extracts text -> Sends to `background.js` (Flow 1 starts).
    *   `popup.js`: Listens via `chrome.storage.onChanged` for `lastAnalysis` to update UI when analysis completes.
    *   User clicks "View Details".
    *   `popup.js`: Calls `chrome.sidePanel.open({ tabId: currentTabId })`.

3.  **Side Panel Interaction & News Fetch:**
    *   User opens side panel (via popup).
    *   `sidepanel.js`: Initializes -> Reads `chrome.storage.local.get(['lastAnalysis'])` -> `displayAnalysisResult`.
    *   `sidepanel.js` (if `result.text` exists): -> `background.js`: `chrome.runtime.sendMessage({ action: "getNews", data: text })`.
    *   `background.js`: Receives request -> Calls Backend API (`/news`).
    *   Backend API -> `background.js`: Returns news JSON.
    *   `background.js` -> `sidepanel.js`: Sends news JSON back as response to `sendMessage`.
    *   `sidepanel.js`: Receives response -> `renderNewsResults`.
    *   `sidepanel.js`: Listens via `chrome.storage.onChanged` for `lastAnalysis` updates.

4.  **Theme Synchronization:**
    *   `popup.js` / `sidepanel.js`: On load, read `chrome.storage.local.get(['theme'])` -> `applyTheme`/`applyThemeUI`.
    *   `sidepanel.js`: User clicks theme toggle -> `cycleTheme` -> Writes *new* theme to `chrome.storage.local.set({ theme: nextTheme })`.
    *   `popup.js` / `sidepanel.js`: `chrome.storage.onChanged` listener detects `theme` change -> Re-applies theme (`applyTheme`/`applyThemeUI`).

**Diagrammatic Overview:**

```
+-----------------+      +-----------------+      +-----------------+      +-----------------+
|   Web Page      |<---- |   content.js    |----->|  background.js  |<---- |     popup.js    |
|     (DOM)       |      | (Extract Text,  |      | (API Calls,     |----->| (UI, Trigger,   |
+-------^---------+      |  Listen Select) |<-----|  Storage Mgmt,  |      |  Open Sidepanel)|
        |                +--------^--------+      |  Notifications) |      +--------^--------+
        |                         |               +--------^--------+               |
        | chrome.tabs.sendMessage |                        |                        | chrome.sidePanel.open
        | (analyzeContent)        | chrome.runtime.sendMessage                    |
        +-------------------------+ (analyzeText, getNews, ping)                  |
                                  | chrome.storage.local (Write: lastAnalysis)    v
                                  |                                      +-----------------+
                                  |                                      |  sidepanel.js   |
                                  |                                      | (Detailed UI,   |
                                  +------------------------------------->|  Fetch News,    |
                                        chrome.storage.onChanged         |  Theme Toggle)  |
                                        (lastAnalysis, theme)            +--------^--------+
                                                                                  |
                                           chrome.storage.local (Read/Write: theme)|
                                           chrome.storage.local (Read: lastAnalysis)|

Backend API (`/check`, `/news`) <--------------------------------------> background.js
chrome.storage.local (`lastAnalysis`, `theme`) <----------------------> background.js, popup.js, sidepanel.js, content.js (write lastAnalysis)
```

**Key Communication Patterns:**

*   **Request/Response:** `chrome.runtime.sendMessage` often used for direct requests where a response is expected (e.g., `sidepanel.js` asking `background.js` for news).
*   **Event-Driven (Storage):** `chrome.storage.onChanged` is crucial for decoupling. `background.js` writes analysis results, and `popup.js`/`sidepanel.js` reactively update their UIs when the data changes, without direct messaging for this update. Theme sync also relies heavily on this.
*   **Targeted Tab Communication:** `chrome.tabs.sendMessage` is used when the popup needs to interact specifically with the content script of the currently active tab.
*   **Central Hub:** `background.js` acts as the intermediary for backend calls and complex logic, keeping other scripts focused on UI or DOM interaction.
