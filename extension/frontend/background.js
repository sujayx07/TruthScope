// Define backend endpoints
const TEXT_ANALYSIS_URL = "http://127.0.0.1:5000/analyze";
// const MEDIA_ANALYSIS_URL = "http://127.0.0.1:5000/analyze_media"; // Old combined endpoint
const IMAGE_ANALYSIS_URL = "http://127.0.0.1:6000/analyze_image"; // New image endpoint
const VIDEO_ANALYSIS_URL = "http://127.0.0.1:6000/analyze_video"; // New video endpoint
const AUDIO_ANALYSIS_URL = "http://127.0.0.1:6000/analyze_audio"; // New audio endpoint

// Keep track of active connections and processing state per tab
let activeConnections = new Set();
// Store analysis results per tab { tabId: { textResult: ..., mediaResult: ..., mediaItems: { url: result, ... } } }
let processingState = {};

// Handle connection events
chrome.runtime.onConnect.addListener((port) => {
  console.assert(port.name === 'analysisPort');
  activeConnections.add(port);

  port.onMessage.addListener((msg) => {
    // Handle messages from the port if needed
  });
  
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
    if (!articleText || articleText.length < 25) {
        console.warn(`[Tab ${tabId}] Text content too short, skipping analysis.`);
        sendResponse({ status: "skipped", reason: "Content too short" });
        return false; // No async operation
    }

    // Limit input size
    const textToSend = articleText.slice(0, 3000); // Adjust limit as needed

    fetch(TEXT_ANALYSIS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ url: url, article_text: textToSend })
    })
      .then(async response => {
        console.log(`[Tab ${tabId}] Text Analysis API Response Status:`, response.status);
        if (!response.ok) {
          const errorText = await response.text();
          let errorDetail = errorText;
          try {
              const errorJson = JSON.parse(errorText);
              errorDetail = errorJson.error || errorText;
          } catch(e) { /* Ignore if not JSON */ }
          throw new Error(`HTTP ${response.status}: ${errorDetail}`);
        }
        return response.json();
      })
      .then(result => {
        console.log(`[Tab ${tabId}] Backend analysis result:`, result);

        if (result && result.error) {
            console.error(`[Tab ${tabId}] Backend returned an error: ${result.error}`);
            if (!processingState[tabId]) processingState[tabId] = {};
            processingState[tabId].textResult = { error: result.error };
            chrome.tabs.sendMessage(tabId, {
                action: "analysisError",
                error: result.error
            }).catch(err => console.log(`[Tab ${tabId}] Error sending analysisError to content script:`, err));
            sendResponse({ status: "error", error: result.error });
            return;
        }

        if (result && result.textResult) {
            if (!processingState[tabId]) processingState[tabId] = {};
            processingState[tabId].textResult = result.textResult;

            chrome.tabs.sendMessage(tabId, {
                action: "analysisComplete",
                result: result.textResult
            }).catch(err => console.log(`[Tab ${tabId}] Error sending analysisComplete to content script:`, err));

            if (result.textResult.highlights && result.textResult.highlights.length > 0) {
                chrome.tabs.sendMessage(tabId, {
                    action: "applyHighlights",
                    highlights: result.textResult.highlights
                }).catch(err => console.log(`[Tab ${tabId}] Error sending highlights to content script:`, err));
            }

            chrome.runtime.sendMessage({
                action: "analysisComplete",
                tabId: tabId,
                result: result.textResult
            }).catch(err => console.log(`Error notifying UI components of analysis completion:`, err));

            sendResponse({ status: "success", resultReceived: true });
        } else {
             console.error(`[Tab ${tabId}] Backend response did not contain expected 'textResult'. Response:`, result);
             if (!processingState[tabId]) processingState[tabId] = {};
             processingState[tabId].textResult = { error: "Invalid response format from backend." };
             chrome.tabs.sendMessage(tabId, {
                 action: "analysisError",
                 error: "Invalid response format from backend."
             }).catch(err => console.log(`[Tab ${tabId}] Error sending analysisError (invalid format) to content script:`, err));
             sendResponse({ status: "error", error: "Invalid response format from backend." });
        }
      })
      .catch(error => {
        console.error(`[Tab ${tabId}] ❌ Error during text analysis fetch:`, error);
        if (!processingState[tabId]) processingState[tabId] = {};
        processingState[tabId].textResult = { error: error.message };

        chrome.tabs.sendMessage(tabId, {
            action: "analysisError",
            error: error.message
        }).catch(err => console.log(`[Tab ${tabId}] Error sending analysisError to content script:`, err));

        sendResponse({ status: "error", error: error.message });
      });

    return true; // Indicate async response
  }

  // --- NEW: Handle individual media item processing requests ---
  if (message.action === "processMediaItem" && tabId) {
      const { mediaUrl, mediaType, mediaId } = message.data;
      console.log(`🖼️ [Tab ${tabId}] Received ${mediaType} for analysis: ${mediaUrl} (ID: ${mediaId})`);

      // Basic validation (mediaId is needed to send back to content script)
      if (!mediaUrl || !mediaType || !mediaId) {
          console.warn(`[Tab ${tabId}] Invalid media item data received.`);
          // Send error back to content script immediately
          chrome.tabs.sendMessage(tabId, {
              action: "displayMediaAnalysis",
              data: {
                  mediaId: mediaId || 'unknown', // Send back ID if available
                  error: "Invalid media data received by background script."
              }
          }).catch(err => console.log(`[Tab ${tabId}] Error sending invalid data error to content script:`, err));
          sendResponse({ status: "error", error: "Invalid media data" });
          return false; // No async operation
      }

      // --- Determine the correct API endpoint based on mediaType ---
      let targetUrl;
      switch (mediaType.toLowerCase()) {
          case 'img': // Assuming content script sends 'img' for images
          case 'image':
              targetUrl = IMAGE_ANALYSIS_URL;
              break;
          case 'video':
              targetUrl = VIDEO_ANALYSIS_URL;
              break;
          case 'audio':
              targetUrl = AUDIO_ANALYSIS_URL;
              break;
          default:
              console.warn(`[Tab ${tabId}] Unsupported media type: ${mediaType}. Cannot analyze.`);
              // Send error back to content script
              chrome.tabs.sendMessage(tabId, {
                  action: "displayMediaAnalysis",
                  data: {
                      mediaId: mediaId,
                      error: `Unsupported media type: ${mediaType}`
                  }
              }).catch(err => console.log(`[Tab ${tabId}] Error sending unsupported type error to content script:`, err));
              sendResponse({ status: "error", error: `Unsupported media type: ${mediaType}` });
              return false; // Stop processing
      }
      // --- End endpoint determination ---

      fetch(targetUrl, { // <-- Use the determined targetUrl
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              "Accept": "application/json"
          },
          // Send only the URL, as type is implied by the endpoint
          body: JSON.stringify({ media_url: mediaUrl })
      })
      .then(async response => {
          console.log(`[Tab ${tabId}] Media Item Analysis API Response Status (${mediaUrl}):`, response.status);
          if (!response.ok) {
              const errorText = await response.text();
              let errorDetail = errorText;
              try {
                  const errorJson = JSON.parse(errorText);
                  errorDetail = errorJson.error || errorText;
              } catch(e) { /* Ignore if not JSON */ }
              // Throw an object containing the status and detail for the catch block
              throw { status: response.status, message: `HTTP ${response.status}: ${errorDetail}` };
          }
          return response.json();
      })
      .then(result => {
          console.log(`[Tab ${tabId}] Media item analysis result for ${mediaUrl}:`, result);

          // <<< Extract the single line summary and send back >>>
          // Assuming backend returns { "analysis_summary": "..." }
          const summaryText = result?.analysis_summary || "Analysis complete, no summary provided.";

          chrome.tabs.sendMessage(tabId, {
              action: "displayMediaAnalysis",
              data: {
                  mediaId: mediaId,
                  summary: summaryText // Send only the summary text
              }
          }).catch(err => console.log(`[Tab ${tabId}] Error sending displayMediaAnalysis to content script:`, err));

          // Notify other UI components (optional, send summary)
          chrome.runtime.sendMessage({
              action: "mediaAnalysisItemComplete",
              tabId: tabId,
              mediaUrl: mediaUrl,
              summary: summaryText // Send summary
          }).catch(err => console.log(`Error notifying UI components of media item analysis completion:`, err));

          // Send success back to the content script's button handler
          sendResponse({ status: "success", resultReceived: true });
      })
      .catch(error => {
          // error might be a network error (Error object) or the object thrown above
          const errorMessage = error.message || "Unknown analysis error";
          console.error(`[Tab ${tabId}] ❌ Error during media item analysis fetch for ${mediaUrl}:`, error);

          // <<< Send error back to content script for display >>>
          chrome.tabs.sendMessage(tabId, {
              action: "displayMediaAnalysis",
              data: {
                  mediaId: mediaId,
                  error: errorMessage // Send error message (no change here)
              }
          }).catch(err => console.log(`[Tab ${tabId}] Error sending displayMediaAnalysis (error) to content script:`, err));

          // Notify UI components of the error (optional)
          // chrome.runtime.sendMessage({ ... });

          // Send error back to the content script's button handler
          sendResponse({ status: "error", error: errorMessage });
      });

      return true; // Indicate async response
  }
  // --- END NEW MEDIA ITEM HANDLER ---

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
