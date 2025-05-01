# TruthScope: Fake News Detection Chrome Extension

A Chrome extension that helps users identify potential fake news and misinformation by analyzing both textual content and media elements using machine learning and fact-checking APIs.

## Features

- 🔍 Real-time article and media analysis
- 🤖 BERT-based fake news detection
- 📷 Media manipulation detection
- 📚 Integration with fact-checking services
- 🔔 Detailed analysis view in side panel
- 🎨 Modern, user-friendly interface with theme support
- 🎯 Automatic highlighting of potentially misleading text segments
- 📊 Confidence scoring for analysis results

## Technical Architecture

TruthScope follows a modular architecture with four main components that work together:

### 1. Content Script (content.js)

Extracts article content and media from web pages and communicates with the background script.

**Key Responsibilities:**
- Extracts text from article-like web pages
- Identifies images and video content for analysis
- Sends content to the background script for processing
- Highlights potentially misleading content on the page

**Code Snippet:**
```javascript
// Function to extract article content and media, then send for analysis
async function init() {
  try {
    if (!isArticlePage()) {
        console.log("Not an article page, skipping analysis.");
        return;
    }

    const processPage = async () => {
        const content = extractArticleContent();
        const mediaSources = extractMediaSources();
        const url = window.location.href;

        // Send text and media data in parallel
        await Promise.all([
            sendTextData(url, content),
            sendMediaData(url, mediaSources)
        ]);
    };

    if (document.readyState === 'complete') {
      await processPage();
    } else {
      window.addEventListener('load', processPage);
    }
  } catch (error) {
    console.error('Error in initialization:', error);
  }
}

// Function to apply highlights to misleading content
function applyHighlights(highlights) {
  if (!highlights || highlights.length === 0) return;
  
  console.log("Applying highlights:", highlights);
  const highlightStyle = 'background-color: yellow; color: black;';
  
  // DOM traversal to find and highlight text segments
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  // ...highlight implementation...
}
```

### 2. Background Script (background.js)

Acts as the central hub for the extension, processing content and coordinating communication.

**Key Responsibilities:**
- Receives content and media from the content script
- Sends data to separate backend endpoints for analysis
- Stores analysis results per tab
- Distributes results to UI components and content script
- Provides highlighting instructions back to content script

**Code Snippet:**
```javascript
// Handle messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  // Process text content from content script
  if (message.action === "processText" && tabId) {
    console.log(`📝 [Tab ${tabId}] Received text for analysis:`, message.data.url);
    const { url, articleText } = message.data;
    
    // Send to backend for analysis
    fetch(TEXT_ANALYSIS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url, text: articleText.slice(0, 2000) })
    })
      .then(response => response.json())
      .then(result => {
        // Store result for this tab
        if (!processingState[tabId]) processingState[tabId] = {};
        processingState[tabId].textResult = result;

        // Send highlights back to content script if available
        if (result.highlights && result.highlights.length > 0) {
            chrome.tabs.sendMessage(tabId, {
                action: "applyHighlights",
                highlights: result.highlights
            });
        }
        
        // ...additional result handling...
      });
    return true; // Indicate async response
  }
  
  // Handle requests for results from popup or sidepanel
  if (message.action === "getResultForTab") {
      const targetTabId = message.tabId;
      if (processingState[targetTabId]) {
          sendResponse({ status: "found", data: processingState[targetTabId] });
      } else {
          sendResponse({ status: "not_found" });
      }
      return false; // Synchronous response
  }
  
  // ...other message handlers...
});
```

### 3. Popup UI (popup.js)

Provides a quick overview of the analysis results in a compact popup interface.

**Key Responsibilities:**
- Fetches analysis results for the current tab
- Displays a summary of the credibility assessment
- Provides a button to open the more detailed side panel
- Synchronizes theme preferences across components

**Code Snippet:**
```javascript
// Get the current tab and request results from background script
chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentTab = tabs[0];
    if (currentTab && currentTab.id) {
        statusDiv.textContent = 'Loading analysis results...';
        statusIndicator.className = 'status-indicator unknown pulse-animation';
        
        // Request results from background script
        chrome.runtime.sendMessage(
            { action: "getResultForTab", tabId: currentTab.id },
            (response) => {
                if (response && response.status === "found") {
                    console.log("Received data for popup:", response.data);
                    updateUI(response.data);
                } else if (response && response.status === "not_found") {
                    statusDiv.textContent = 'Analysis not yet complete or page not supported.';
                    statusIndicator.className = 'status-indicator unknown pulse-animation';
                } else {
                    statusDiv.textContent = 'Could not retrieve analysis results.';
                    statusIndicator.className = 'status-indicator unknown';
                }
            }
        );
    }
});

// Update UI based on analysis results
function updateUI(data) {
    if (data.textResult) {
        if (data.textResult.label !== undefined) {
            const isFake = data.textResult.label === "LABEL_1";
            const confidence = (data.textResult.score * 100).toFixed(1);
            
            statusDiv.textContent = `${isFake ? 
                'This content may be misleading' : 
                'This content appears to be authentic'}`;
            
            // Update visual indicator based on credibility
            statusIndicator.className = `status-indicator ${isFake ? 'fake' : 'real'}`;
            // ...update indicator content...
        }
    }
}
```

### 4. Side Panel UI (sidepanel.js)

Shows detailed analysis results including confidence scores, fact checks, and media analysis.

**Key Responsibilities:**
- Displays comprehensive analysis results
- Shows fact-checking sources and related information
- Presents media analysis results
- Offers theme customization options
- Allows refreshing results

**Code Snippet:**
```javascript
// Function to fetch and display results for the current tab
function loadResultsForCurrentTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const currentTab = tabs[0];
        if (currentTab && currentTab.id) {
            statusBadge.textContent = "Loading...";
            statusBadge.className = "status-badge loading";
            
            // Request detailed results from background script
            chrome.runtime.sendMessage(
                { action: "getResultForTab", tabId: currentTab.id },
                (response) => {
                    if (response && response.status === "found") {
                        console.log("Received data for sidepanel:", response.data);
                        displayResults(response.data);
                    } else {
                        // ...handle not found or error cases...
                    }
                }
            );
        }
    });
}

// Display detailed analysis results
function displayResults(data) {
    if (data.textResult) {
        if (data.textResult.label !== undefined) {
            const isFake = data.textResult.label === "LABEL_1";
            const confidence = (data.textResult.score * 100).toFixed(1);
            
            statusBadge.textContent = isFake ? 
                "Potential Misinformation" : "Likely Credible";
            statusBadge.className = `status-badge ${isFake ? 'fake' : 'real'}`;
            confidenceDiv.textContent = `Confidence Score: ${confidence}%`;
            
            // Display fact-check information if available
            if (data.textResult.fact_check && 
                Array.isArray(data.textResult.fact_check) && 
                data.textResult.fact_check.length > 0) {
                const factsHtml = data.textResult.fact_check
                    .map(createSourceItemHTML).join('');
                factCheckResultsContainer.innerHTML = factsHtml;
            }
        }
    }
    
    // Display media analysis results if available
    if (data.mediaResult) {
        // ...render media analysis results...
    }
}
```

## File Interactions and Communication Architecture

The TruthScope extension relies on a carefully designed communication architecture where each component has specific responsibilities and communicates with others through well-defined channels:

### Content Script (content.js) Interactions

- **Initializes** automatically when a webpage is loaded
- **Extracts** article content and media elements from the page DOM
- **Communicates with background.js** by sending:
  - `processText` messages with article text for credibility analysis
  - `processMedia` messages with image and video URLs for media manipulation detection
- **Receives from background.js**:
  - `applyHighlights` messages containing text segments to highlight on the page
  - `analysisComplete` notifications when text analysis is finished
  - `mediaAnalysisComplete` notifications when media analysis is finished
- **Modifies the webpage** by highlighting potentially misleading content directly in the DOM

### Background Script (background.js) Interactions

- **Acts as the central communication hub** between all components
- **Maintains state** for each analyzed tab using the `processingState` object, storing:
  - Text analysis results (`textResult`)
  - Media analysis results (`mediaResult`)
- **Handles requests from content.js**:
  - Processes raw text through the text analysis API
  - Processes media URLs through the media analysis API
  - Sends highlight instructions back to content script
- **Communicates with popup.js and sidepanel.js**:
  - Responds to `getResultForTab` requests with analysis data
  - Sends `analysisComplete` and `mediaAnalysisComplete` notifications
- **Manages backend communication**:
  - Sends requests to backend API endpoints
  - Parses and normalizes API responses
  - Handles errors and retries
- **Provides a test mode** with sample responses for development and testing

### Popup UI (popup.js) Interactions

- **Initializes** when the user clicks the extension icon
- **Queries background.js** for current tab analysis results using `getResultForTab`
- **Updates UI** based on credibility assessment:
  - Shows a color-coded status indicator (red/green/gray)
  - Displays a brief summary of the credibility evaluation
- **Opens sidepanel.js** when the user clicks the "View Details" button
- **Synchronizes theme preferences** with sidepanel using `chrome.storage.local`
- **Listens for changes** to analysis results via `chrome.runtime.onMessage`

### Side Panel UI (sidepanel.js) Interactions

- **Initializes** when opened from the popup or via Chrome's side panel feature
- **Queries background.js** for detailed analysis results using `getResultForTab`
- **Renders comprehensive results**:
  - Credibility score and confidence level
  - AI-generated reasoning about the content
  - Media analysis findings
  - Fact-check sources and related information
- **Synchronizes theme preferences** using `chrome.storage.local`
- **Listens for updates** from background script to refresh results in real-time
- **Provides theme customization** that affects all extension UI components

### Data Flow Sequence Diagram

```
Webpage → content.js → background.js → Backend APIs
                             ↓
                        processingState
                             ↓
popup.js ← background.js → sidepanel.js
                ↓                 
            User Interface
```

### Theme Management Across Components

Both popup.js and sidepanel.js implement identical theme management logic:

1. **Theme Storage**: Preferences stored in `chrome.storage.local` as 'light', 'dark', or 'system'
2. **Theme Detection**: System theme detected via `window.matchMedia('(prefers-color-scheme: dark')`
3. **Theme Synchronization**: Changes in one component reflect in the other through storage events
4. **Theme Application**: HTML classes control the appearance of UI elements in both components

This architecture ensures a seamless user experience with consistent theme application across all extension UI components.

## Communication Flow

The extension follows a carefully designed data flow:

1. **Content → Background**:
   - Content script extracts article text and media
   - Sends to background script using separate actions: `processText` and `processMedia`

2. **Background → Backend**:
   - Background script sends data to respective analysis endpoints
   - Text to text analysis API, media to media analysis API

3. **Background → Content**:
   - Background script sends highlight instructions back to content script
   - Content script applies highlights to potentially misleading text segments

4. **Background → UI Components**:
   - Popup requests summary data from background script
   - Side panel requests detailed analysis from background script
   - Both components properly display results based on the credibility assessment

5. **Theme Synchronization**:
   - Both popup and side panel use `chrome.storage.local` to maintain theme consistency
   - Changes in either component are reflected in the other

## Prerequisites

- Chrome browser
- Python 3.7 or higher (for backend)
- Backend API keys (see backend setup)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd TruthScope
```

### 2. Set Up the Backend

1. Navigate to the backend directory:
```bash
cd extension/backend
```

2. Create and activate a virtual environment (optional but recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install required packages:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the backend directory with your API keys:
```
GOOGLE_FACT_CHECK_API_KEY=your_api_key_here
NEWS_API_KEY=your_news_api_key_here
```

5. Start the backend server:
```bash
python app.py
```

The backend will run on `http://127.0.0.1:5000`

### 3. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" and select the extension directory
4. The extension icon should appear in your Chrome toolbar

## Usage

1. **Automatic Analysis**:
   - Navigate to any news article or content page
   - The extension will automatically analyze the page content
   - Click the extension icon to see a summary of the analysis

2. **Detailed Analysis**:
   - Click the "View Details" button in the popup
   - The side panel will open with comprehensive analysis results
   - Review fact-check sources and media analysis

3. **Visual Indicators**:
   - Potentially misleading text segments are highlighted on the page
   - The popup shows a color-coded credibility indicator
   - The side panel displays confidence scores and related information

4. **Theme Customization**:
   - Click the theme toggle button in the side panel
   - Choose between light, dark, or system theme

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- BERT model for text classification
- Media analysis techniques
- Google Fact Check API
- Chrome Extension APIs

# TruthScope Extension - Frontend

This directory contains the frontend code for the TruthScope Chrome Extension. It provides the user interface (popup, side panel) for interacting with the media analysis features.

## Features

*   **Popup Interface (`popup.html`, `popup.js`):**
    *   Displays the main extension interface when the icon is clicked.
    *   Allows users to sign in with Google (though authentication logic primarily resides in the backend).
    *   Shows user status (e.g., signed in, tier).
    *   Provides buttons/controls to trigger media analysis.
*   **Content Script (`content.js`):**
    *   Runs in the context of web pages visited by the user.
    *   Detects media elements (images, potentially video/audio in the future) on the page.
    *   Adds context menu items or overlays to trigger analysis for specific media.
    *   Communicates with the background script.
*   **Background Script (`background.js`):**
    *   Acts as the central controller for the extension.
    *   Listens for messages from the popup and content scripts.
    *   Manages communication with the backend Flask server.
    *   Handles user authentication state (storing tokens/IDs securely).
    *   Makes API calls to the backend endpoints (`/analyze_image`, `/analyze_video`, `/analyze_audio`).
*   **Side Panel (`sidepanel.html`, `sidepanel.js`):**
    *   Provides a persistent panel (if configured in `manifest.json`) to display detailed analysis results or history.
*   **Manifest (`manifest.json`):**
    *   Defines the extension's properties, permissions, scripts, and UI components.
    *   Specifies necessary permissions (e.g., `storage`, `activeTab`, `contextMenus`, access to backend URL).

## Setup & Loading the Extension

1.  **Backend Running:** Ensure the backend server (`extension/backend/check_media.py`) is running and accessible (e.g., at `http://localhost:3000`). The frontend needs to communicate with it.
2.  **Open Chrome Extensions:** Navigate to `chrome://extensions` in your Chrome browser.
3.  **Enable Developer Mode:** Toggle the "Developer mode" switch in the top-right corner.
4.  **Load Unpacked:**
    *   Click the "Load unpacked" button.
    *   Navigate to and select the `extension/frontend` directory within your project.
5.  **Pin the Extension:** Find the TruthScope extension in your toolbar (you might need to click the puzzle piece icon) and pin it for easy access.

## Development

*   **Making Changes:** After modifying any frontend file (HTML, CSS, JS), you need to reload the extension in `chrome://extensions` by clicking the refresh icon for the TruthScope extension.
*   **Debugging:**
    *   **Popup:** Right-click the extension icon and select "Inspect popup".
    *   **Background Script:** Go to `chrome://extensions`, find TruthScope, and click the "service worker" link.
    *   **Content Script:** Open the developer tools (F12) on a webpage where the content script is active and check the Console tab (make sure the context is set to the page, not the extension).
    *   **Side Panel:** If using the side panel, right-click within the panel and select "Inspect".
*   **Backend URL:** Ensure the `fetch` calls in `background.js` (or wherever API calls are made) point to the correct URL where your backend server is running.

## Key Files

*   `manifest.json`: Core configuration file.
*   `popup.html`/`popup.js`: UI and logic for the browser action popup.
*   `content.js`: Interacts with web page content.
*   `background.js`: Event handling and backend communication.
*   `sidepanel.html`/`sidepanel.js`: UI and logic for the side panel (if enabled).