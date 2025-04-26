// Sample test responses for development and testing
const SAMPLE_RESPONSES = {
  // Sample 1: Fake news with high confidence and fact checks
  fakeSample: {
    textResult: {
      label: "LABEL_1", // Fake news label
      score: 0.87,      // 87% confidence
      highlights: [
        "The government admitted to covering up the evidence",
        "Scientists were silenced after discovering the truth",
        "Secret documents reveal the conspiracy"
      ],
      fact_check: [
        {
          source: "FactChecker.org",
          title: "No Evidence of Claimed Government Cover-up",
          url: "https://www.factchecker.org/2025/04/no-evidence-government-coverup",
          claim: "This claim has been debunked by multiple investigations"
        },
        {
          source: "TruthOrFiction",
          title: "Scientists Were Not Silenced: The Real Story",
          url: "https://www.truthorfiction.com/2025/04/scientists-not-silenced",
          claim: "Interviews with the scientists mentioned confirm they were not silenced"
        }
      ]
    },
    mediaResult: {
      images_analyzed: 3,
      videos_analyzed: 1,
      manipulated_images_found: 2,
      manipulation_confidence: 0.92,
      manipulated_media: [
        {
          url: "https://example.com/image1.jpg",
          type: "image",
          manipulation_type: "digitally_altered",
          confidence: 0.95
        },
        {
          url: "https://example.com/image3.jpg",
          type: "image",
          manipulation_type: "out_of_context",
          confidence: 0.89
        }
      ]
    }
  },
  
  // Sample 2: Credible content with high confidence
  credibleSample: {
    textResult: {
      label: "LABEL_0", // Credible content label
      score: 0.92,      // 92% confidence
      highlights: [],   // No misleading highlights
      fact_check: [
        {
          source: "Reuters Fact Check",
          title: "Content verified by multiple primary sources",
          url: "https://www.reuters.com/factcheck/2025-04-25",
          claim: "This reporting is consistent with official records"
        }
      ]
    },
    mediaResult: {
      images_analyzed: 4,
      videos_analyzed: 2,
      manipulated_images_found: 0,
      manipulation_confidence: 0.05,
      manipulated_media: []
    }
  },
  
  // Sample 3: Uncertain content with low confidence and mixed signals
  uncertainSample: {
    textResult: {
      label: "LABEL_1", // Leaning toward fake but uncertain
      score: 0.56,      // Only 56% confidence - much lower
      highlights: [
        "Reports suggest potential issues with the data",
        "Some experts have questioned the methodology"
      ],
      fact_check: [
        {
          source: "Science Daily",
          title: "Research Methodology Shows Mixed Results",
          url: "https://www.sciencedaily.com/2025/04/methodology-analysis",
          claim: "Experts are divided on the validity of the methodology used"
        }
      ]
    },
    mediaResult: {
      images_analyzed: 2,
      videos_analyzed: 0,
      manipulated_images_found: 0,
      manipulation_confidence: 0.35, // Uncertain
      manipulated_media: [
        {
          url: "https://example.com/chart1.jpg",
          type: "image",
          manipulation_type: "potentially_misleading",
          confidence: 0.65
        }
      ]
    }
  }
};

// Optional: Uncomment this line to enable test mode that returns sample data instead of calling real API
// const TEST_MODE = true;

// Define backend endpoints
const TEXT_ANALYSIS_URL = "http://127.0.0.1:5000/check"; // Your text analysis backend
const MEDIA_ANALYSIS_URL = "http://127.0.0.1:5000/check_media"; // Your separate media analysis backend

// Keep track of active connections and processing state per tab
let activeConnections = new Set();
let processingState = {}; // Store analysis results per tab { tabId: { textResult: ..., mediaResult: ... } }

// Handle connection events
chrome.runtime.onConnect.addListener((port) => {
  activeConnections.add(port);
  
  // Handle keep-alive connections
  if (port.name === "keepAlive") {
    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        console.log('Keep-alive port disconnected');
      }
    });
  }
  
  port.onDisconnect.addListener(() => {
    activeConnections.delete(port);
  });
});

// Handle messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  // Handle ping messages for connection checking
  if (message.action === "ping") {
    sendResponse({ status: "ready" });
    return true;
  }

  // Handle text processing requests from content script
  if (message.action === "processText" && tabId) {
    console.log(`📝 [Tab ${tabId}] Received text for analysis:`, message.data.url);
    const { url, articleText } = message.data;

    // Basic validation
    if (!articleText || articleText.length < 50) {
        console.warn(`[Tab ${tabId}] Text content too short, skipping analysis.`);
        sendResponse({ status: "skipped", reason: "Content too short" });
        return false; // No async operation
    }

    // Limit input size
    const textToSend = articleText.slice(0, 2000); // Adjust limit as needed

    fetch(TEXT_ANALYSIS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ url: url, text: textToSend })
    })
      .then(async response => {
        console.log(`[Tab ${tabId}] Text Analysis API Response Status:`, response.status);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        return response.json();
      })
      .then(result => {
        console.log(`[Tab ${tabId}] Text backend analysis result:`, result);

        // Store result for this tab
        if (!processingState[tabId]) processingState[tabId] = {};
        processingState[tabId].textResult = result;

        // Send result summary to the specific content script that requested it
        chrome.tabs.sendMessage(tabId, {
            action: "analysisComplete",
            result: result // Send the whole result for now
        }).catch(err => console.log(`[Tab ${tabId}] Error sending analysisComplete to content script:`, err));

        // Send highlights back to the content script for rendering
        if (result.highlights && result.highlights.length > 0) {
            chrome.tabs.sendMessage(tabId, {
                action: "applyHighlights",
                highlights: result.highlights
            }).catch(err => console.log(`[Tab ${tabId}] Error sending highlights to content script:`, err));
        }

        // Send result to popup/sidepanel IF THEY ARE OPEN (or they can request it)
        // We'll implement a request mechanism instead of pushing blindly

        sendResponse({ status: "success", resultReceived: true });
      })
      .catch(error => {
        console.error(`[Tab ${tabId}] ❌ Error during text analysis:`, error);
        // Store error state
        if (!processingState[tabId]) processingState[tabId] = {};
        processingState[tabId].textResult = { error: error.message };

        // Notify content script of error
        chrome.tabs.sendMessage(tabId, {
            action: "analysisError",
            error: error.message
        }).catch(err => console.log(`[Tab ${tabId}] Error sending analysisError to content script:`, err));

        sendResponse({ status: "error", error: error.message });
      });

    return true; // Indicate async response
  }

  // Handle media processing requests from content script
  if (message.action === "processMedia" && tabId) {
    console.log(`🖼️ [Tab ${tabId}] Received media for analysis:`, message.data.url);
    const { url, imageSources, videoSources } = message.data;

    if (imageSources.length === 0 && videoSources.length === 0) {
        console.warn(`[Tab ${tabId}] No media sources found, skipping media analysis.`);
        sendResponse({ status: "skipped", reason: "No media sources" });
        return false; // No async operation
    }

    fetch(MEDIA_ANALYSIS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      // Send only a limited number of sources if necessary
      body: JSON.stringify({ url: url, images: imageSources.slice(0, 10), videos: videoSources.slice(0, 5) })
    })
      .then(async response => {
        console.log(`[Tab ${tabId}] Media Analysis API Response Status:`, response.status);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        return response.json();
      })
      .then(result => {
        console.log(`[Tab ${tabId}] Media backend analysis result:`, result);

        // Store result for this tab
        if (!processingState[tabId]) processingState[tabId] = {};
        processingState[tabId].mediaResult = result;

        // Optionally notify content script or UI components
        chrome.tabs.sendMessage(tabId, {
            action: "mediaAnalysisComplete",
            result: result
        }).catch(err => console.log(`[Tab ${tabId}] Error sending mediaAnalysisComplete to content script:`, err));

        sendResponse({ status: "success", resultReceived: true });
      })
      .catch(error => {
        console.error(`[Tab ${tabId}] ❌ Error during media analysis:`, error);
        // Store error state
        if (!processingState[tabId]) processingState[tabId] = {};
        processingState[tabId].mediaResult = { error: error.message };

         // Optionally notify content script or UI components
        chrome.tabs.sendMessage(tabId, {
            action: "mediaAnalysisError",
            error: error.message
        }).catch(err => console.log(`[Tab ${tabId}] Error sending mediaAnalysisError to content script:`, err));

        sendResponse({ status: "error", error: error.message });
      });

    return true; // Indicate async response
  }

  // Handle requests for results from popup or sidepanel
  if (message.action === "getResultForTab") {
      const targetTabId = message.tabId;
      console.log(`📊 Request for results for tab ${targetTabId}`);
      if (processingState[targetTabId]) {
          sendResponse({ status: "found", data: processingState[targetTabId] });
      } else {
          sendResponse({ status: "not_found" });
      }
      return false; // Synchronous response
  }

  // Default case if action not handled
  // console.log("Unknown message action:", message.action);
  // sendResponse({ status: "unknown_action" });
  return false; // Indicate synchronous handling or no response needed for unhandled actions
});

// Clean up stored results when a tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log(`🗑️ Tab ${tabId} closed, removing stored results.`);
    delete processingState[tabId];
});

// Initialize side panel on install/update but don't open it automatically on action click
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false }) // Changed to false to ensure popup shows instead
    .catch((error) => console.error(error));
});
