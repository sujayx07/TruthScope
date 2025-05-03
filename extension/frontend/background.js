// Define backend endpoints
const TEXT_ANALYSIS_URL = "http://127.0.0.1:5000/analyze";
const IMAGE_ANALYSIS_URL = "http://127.0.0.1:3000/analyze_image";
const VIDEO_ANALYSIS_URL = "http://127.0.0.1:3000/analyze_video";
const AUDIO_ANALYSIS_URL = "http://127.0.0.1:3000/analyze_audio";
const SENTIMENT_BIAS_ANALYSIS_URL = "http://127.0.0.1:5002/analyze_sentiment_bias"; // Added sentiment/bias endpoint
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';
const GOOGLE_REVOKE_URL = 'https://accounts.google.com/o/oauth2/revoke?token=';

// Keep track of active connections and processing state per tab
let activeConnections = new Set();
let processingState = {}; // { tabId: { textResult: ..., mediaResult: ..., mediaItems: { url: result, ... }, sentimentBiasResult: ... } } // Added sentimentBiasResult

// --- Authentication State (Managed by Background Script) ---
let currentAuthToken = null;
let userProfile = null;
let isSigningIn = false; // Prevent concurrent sign-in attempts

/**
 * Fetches user profile information using the Google UserInfo API.
 * @param {string} token - The OAuth token.
 * @returns {Promise<object|null>} User profile object or null on error.
 */
async function fetchUserProfile(token) {
    try {
        const response = await fetch(GOOGLE_USERINFO_URL, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            // If unauthorized (401), the token might be invalid/expired
            if (response.status === 401) {
                 console.warn("User profile fetch failed with 401, token might be invalid.");
                 // Attempt to remove the bad token
                 await removeToken(token); // Use the helper function
                 return null; // Indicate failure
            }
            throw new Error(`Google UserInfo API Error: ${response.status} ${response.statusText}`);
        }
        const profile = await response.json();
        console.log("User profile fetched:", profile);
        return profile;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
}

/**
 * Removes a token from cache and attempts revocation.
 * @param {string} token - The token to remove.
 */
async function removeToken(token) {
    if (!token) return;
    try {
        // Add detailed logging before the call
        console.log(`Attempting to remove token. Type: ${typeof token}, Value:`, JSON.stringify(token));
        await chrome.identity.removeCachedAuthToken({ token: token });
        console.log("Cached token removed.");
        // Attempt revocation (fire and forget)
        fetch(GOOGLE_REVOKE_URL + token).then(response => {
            console.log(`Token revocation attempt status: ${response.status}`);
        }).catch(err => console.warn("Token revocation fetch failed:", err));
    } catch (error) {
        console.error("Error removing cached token:", error);
    }
}

/**
 * Notifies UI components (sidepanel, popup) about auth state changes.
 */
function notifyAuthStateChange() {
    const authState = {
        isSignedIn: !!currentAuthToken,
        profile: userProfile
    };
    console.log("Notifying UI of auth state change:", authState);
    // Send to sidepanel(s) - potentially multiple if supported, or just general message
    chrome.runtime.sendMessage({ action: "authStateUpdated", data: authState })
        .catch(err => console.log("Error sending authStateUpdated message (might be no listeners):", err));
    // Could also send to specific ports if needed:
    // activeConnections.forEach(port => port.postMessage({ action: "authStateUpdated", data: authState }));
}

/**
 * Handles the sign-in process triggered by UI.
 * @returns {Promise<{success: boolean, profile: object|null, error?: string}>}
 */
async function handleSignIn() {
    if (isSigningIn) {
        console.warn("Sign-in already in progress.");
        return { success: false, error: "Sign-in already in progress." };
    }
    isSigningIn = true;
    console.log("Background: Handling sign-in request...");

    try {
        const tokenResult = await chrome.identity.getAuthToken({ interactive: true });
        // Check if tokenResult is an object with a 'token' property, otherwise assume it's the string
        const tokenString = (typeof tokenResult === 'object' && tokenResult?.token) ? tokenResult.token : tokenResult;

        if (chrome.runtime.lastError || !tokenString) {
            console.warn("Sign-in failed or cancelled by user:", chrome.runtime.lastError?.message);
            // Ensure clean state if token fetch fails
            if (currentAuthToken) await handleSignOut(); // Sign out if there was an old token
            return { success: false, error: chrome.runtime.lastError?.message || "Sign-in cancelled or failed." };
        }

        console.log("Background: Token string obtained.");
        currentAuthToken = tokenString; // Store the string
        userProfile = await fetchUserProfile(tokenString); // Pass the string

        if (userProfile) {
            console.log("Background: Sign-in successful, profile fetched.");
            notifyAuthStateChange(); // Notify UI
            return { success: true, profile: userProfile };
        } else {
            console.error("Background: Sign-in failed - could not fetch profile after getting token.");
            await handleSignOut(); // Clean up the failed state
            return { success: false, error: "Could not retrieve user profile after sign-in." };
        }
    } catch (error) {
        console.error("Background: Error during sign-in:", error);
        await handleSignOut(); // Attempt cleanup on error
        return { success: false, error: error.message || "An unexpected error occurred during sign-in." };
    } finally {
        isSigningIn = false;
    }
}

/**
 * Handles the sign-out process.
 */
async function handleSignOut() {
    console.log("Background: Handling sign-out request...");
    const tokenToRevoke = currentAuthToken;
    currentAuthToken = null;
    userProfile = null;

    await removeToken(tokenToRevoke); // Remove and revoke

    notifyAuthStateChange(); // Notify UI about the change
    console.log("Background: Sign-out complete.");
}

/**
 * Checks the initial authentication state non-interactively.
 */
async function checkInitialAuthState() {
    console.log("Background: Checking initial auth state...");
    try {
        const tokenResult = await chrome.identity.getAuthToken({ interactive: false });
        // Check if tokenResult is an object with a 'token' property, otherwise assume it's the string
        const tokenString = (typeof tokenResult === 'object' && tokenResult?.token) ? tokenResult.token : tokenResult;

        if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("OAuth2 not granted")) {
            console.warn("Background: Error during initial token fetch:", chrome.runtime.lastError.message);
        }

        if (tokenString) {
            console.log("Background: User already signed in (initial check).");
            currentAuthToken = tokenString; // Store the string
            userProfile = await fetchUserProfile(tokenString); // Pass the string
            if (!userProfile) {
                // If profile fetch fails with existing token, treat as signed out
                console.warn("Background: Initial profile fetch failed, signing out.");
                await handleSignOut();
            } else {
                 notifyAuthStateChange(); // Notify UI of initial state
            }
        } else {
            console.log("Background: User not signed in initially.");
            // Ensure state is clean if no token found
            currentAuthToken = null;
            userProfile = null;
            notifyAuthStateChange(); // Notify UI (signed out)
        }
    } catch (error) {
        console.error("Background: Error checking initial auth state:", error);
        currentAuthToken = null; // Ensure signed out state on error
        userProfile = null;
        notifyAuthStateChange();
    }
}


// --- Existing Connection Handling (Unchanged) ---
chrome.runtime.onConnect.addListener((port) => {
  console.assert(port.name === 'analysisPort');
  activeConnections.add(port);
  port.onDisconnect.addListener(() => {
    activeConnections.delete(port);
  });
});

// --- Modified Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  // --- Authentication Actions ---
  if (message.action === "signIn") {
      handleSignIn().then(sendResponse);
      return true; // Indicate async response
  }
  if (message.action === "signOut") {
      handleSignOut().then(() => sendResponse({ success: true })); // Sign out is async but we respond immediately after initiating
      return true; // Indicate async response
  }
  if (message.action === "getAuthState") {
      sendResponse({
          isSignedIn: !!currentAuthToken,
          profile: userProfile
      });
      return false; // Synchronous response
  }

  if (message.action === "ping") {
    sendResponse({ status: "ready" });
    return true;
  }

  // --- processText: Reverted Auth Logic, Added Sentiment/Bias Fetch ---
  if (message.action === "processText" && tabId) {
    console.log(`📝 [Tab ${tabId}] Received text for analysis:`, message.data.url);
    const { url, articleText } = message.data;

    // Basic content validation
    if (!articleText || articleText.length < 25) {
        console.warn(`[Tab ${tabId}] Text content too short, skipping analysis.`);
        sendResponse({ status: "skipped", reason: "Content too short" });
        return false;
    }
    const textToSend = articleText.slice(0, 3000); // Use same truncated text for both analyses

    // Use Stored Token
    if (!currentAuthToken) {
        console.warn(`[Tab ${tabId}] No auth token available for text analysis.`);
        sendResponse({ status: "error", error: "Authentication required. Please sign in." });
        chrome.tabs.sendMessage(tabId, { action: "analysisError", error: "Authentication required. Please sign in." })
            .catch(err => console.log(`[Tab ${tabId}] Error sending auth error to content script:`, err));
        return false;
    }

    const token = currentAuthToken; // Use the stored token

    // Text Analysis Fetch
    fetch(TEXT_ANALYSIS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
          url: url,
          article_text: textToSend
      })
    })
    .then(async response => {
        console.log(`[Tab ${tabId}] Text Analysis API Response Status:`, response.status);
        if (response.status === 401 || response.status === 403) {
            console.error(`[Tab ${tabId}] Backend returned ${response.status}. Token likely invalid/expired.`);
            await handleSignOut(); // Sign out the user
            throw new Error(`Authentication failed (${response.status}). Please sign in again.`);
        }
        if (!response.ok) {
          const errorText = await response.text();
          let errorDetail = errorText;
          try { const errorJson = JSON.parse(errorText); errorDetail = errorJson.error || errorText; } catch(e) {}
          throw new Error(`HTTP ${response.status}: ${errorDetail}`);
        }
        return response.json();
    })
    .then(result => {
        console.log(`[Tab ${tabId}] Text analysis result received:`, result);
        if (!processingState[tabId]) processingState[tabId] = {};
        if (result && result.error) {
            processingState[tabId].textResult = { error: result.error };
        } else if (result && result.textResult) {
            processingState[tabId].textResult = result.textResult;
            chrome.tabs.sendMessage(tabId, { action: "analysisComplete", result: result.textResult })
                .catch(err => console.log(`[Tab ${tabId}] Error sending analysisComplete to content script:`, err));
            if (result.textResult.highlights && result.textResult.highlights.length > 0) {
                chrome.tabs.sendMessage(tabId, { action: "applyHighlights", highlights: result.textResult.highlights })
                    .catch(err => console.log(`[Tab ${tabId}] Error sending highlights to content script:`, err));
            }
            chrome.runtime.sendMessage({ action: "analysisComplete", tabId: tabId, result: result.textResult })
                .catch(err => console.log(`Error notifying UI components of analysis completion:`, err));

            // Sentiment/Bias Analysis Fetch
            console.log(`[Tab ${tabId}] Making sentiment/bias analysis request using the same token.`);
            fetch(SENTIMENT_BIAS_ANALYSIS_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    text: textToSend
                })
            })
            .then(async sentimentResponse => {
                console.log(`[Tab ${tabId}] Sentiment/Bias Analysis API Response Status:`, sentimentResponse.status);
                 if (sentimentResponse.status === 401 || sentimentResponse.status === 403) {
                    console.error(`[Tab ${tabId}] Sentiment/Bias backend returned ${sentimentResponse.status}. Token likely invalid/expired.`);
                    throw new Error(`Authentication failed (${sentimentResponse.status}) for sentiment/bias analysis.`);
                }
                if (!sentimentResponse.ok) {
                  const errorText = await sentimentResponse.text();
                  let errorDetail = errorText;
                  try { const errorJson = JSON.parse(errorText); errorDetail = errorJson.error || errorText; } catch(e) {}
                  throw new Error(`Sentiment/Bias HTTP ${sentimentResponse.status}: ${errorDetail}`);
                }
                return sentimentResponse.json();
            })
            .then(sentimentResult => {
                console.log(`[Tab ${tabId}] Sentiment/Bias analysis result:`, sentimentResult);
                if (!processingState[tabId]) processingState[tabId] = {};
                if (sentimentResult && (sentimentResult.sentiment || sentimentResult.bias)) {
                    processingState[tabId].sentimentBiasResult = sentimentResult;
                    chrome.runtime.sendMessage({ action: "sentimentBiasAnalysisComplete", tabId: tabId, result: sentimentResult })
                        .catch(err => console.log(`Error notifying UI components of sentiment/bias completion:`, err));
                } else {
                     console.error(`[Tab ${tabId}] Sentiment/Bias response did not contain expected data. Response:`, sentimentResult);
                     processingState[tabId].sentimentBiasResult = { error: "Invalid response format from sentiment/bias backend." };
                     chrome.runtime.sendMessage({ action: "sentimentBiasAnalysisError", tabId: tabId, error: "Invalid response format" })
                        .catch(err => console.log(`Error notifying UI components of sentiment/bias format error:`, err));
                }
            })
            .catch(error => {
                console.error(`[Tab ${tabId}] ❌ Error during sentiment/bias analysis fetch:`, error);
                if (!processingState[tabId]) processingState[tabId] = {};
                const errorMessage = error.message || "Unknown sentiment/bias analysis error";
                processingState[tabId].sentimentBiasResult = { error: errorMessage };
                 chrome.runtime.sendMessage({ action: "sentimentBiasAnalysisError", tabId: tabId, error: errorMessage })
                    .catch(err => console.log(`Error notifying UI components of sentiment/bias fetch error:`, err));
            });

        } else {
             processingState[tabId].textResult = { error: "Invalid response format from backend." };
             chrome.tabs.sendMessage(tabId, { action: "analysisError", error: "Invalid response format from backend." })
                 .catch(err => console.log(`[Tab ${tabId}] Error sending analysisError (invalid format) to content script:`, err));
        }
        sendResponse({ status: "processing_started", message: "Text analysis initiated." });
    })
    .catch(error => {
        console.error(`[Tab ${tabId}] ❌ Error during text analysis fetch:`, error);
        if (!processingState[tabId]) processingState[tabId] = {};
        const errorMessage = error.message || "Unknown text analysis error";
        processingState[tabId].textResult = { error: errorMessage };
        chrome.tabs.sendMessage(tabId, { action: "analysisError", error: errorMessage })
            .catch(err => console.log(`[Tab ${tabId}] Error sending analysisError to content script:`, err));
        sendResponse({ status: "error", error: errorMessage });
    });

    return true; // Indicate async response
  }

  // --- Modified: processMediaItem ---
  if (message.action === "processMediaItem" && tabId) {
    const { mediaUrl, mediaType, mediaId } = message.data;
    console.log(`🖼️ [Tab ${tabId}] Received ${mediaType} for analysis: ${mediaUrl} (ID: ${mediaId})`);

    // *** Check stored token first ***
    if (!currentAuthToken) {
        console.warn(`[Tab ${tabId}] No auth token available for media analysis for ${mediaUrl}. User needs to sign in.`);
        chrome.tabs.sendMessage(tabId, { action: "displayMediaAnalysis", data: { mediaId: mediaId, error: "Authentication required. Please sign in." }})
            .catch(err => console.log(`[Tab ${tabId}] Error sending media auth error to content script:`, err));
        sendResponse({ status: "error", error: "Authentication required. Please sign in." });
        return false; // Stop processing
    }

    // Basic validation
    if (!mediaUrl || !mediaType || !mediaId) {
        console.warn(`[Tab ${tabId}] Invalid media item data received.`);
        chrome.tabs.sendMessage(tabId, { action: "displayMediaAnalysis", data: { mediaId: mediaId || 'unknown', error: "Invalid media data received by background script." }})
            .catch(err => console.log(`[Tab ${tabId}] Error sending invalid data error to content script:`, err));
        sendResponse({ status: "error", error: "Invalid media data" });
        return false;
    }

    let targetUrl;
    switch (mediaType.toLowerCase()) {
        case 'img': case 'image': targetUrl = IMAGE_ANALYSIS_URL; break;
        case 'video': targetUrl = VIDEO_ANALYSIS_URL; break;
        case 'audio': targetUrl = AUDIO_ANALYSIS_URL; break;
        default:
            console.warn(`[Tab ${tabId}] Unsupported media type: ${mediaType}. Cannot analyze.`);
            chrome.tabs.sendMessage(tabId, { action: "displayMediaAnalysis", data: { mediaId: mediaId, error: `Unsupported media type: ${mediaType}` }})
                .catch(err => console.log(`[Tab ${tabId}] Error sending unsupported type error to content script:`, err));
            sendResponse({ status: "error", error: `Unsupported media type: ${mediaType}` });
            return false;
    }

    // Use proper body structure with the correct parameter name 'media_url' as expected by backend
    const requestBody = { media_url: mediaUrl };
    const requestBodyString = JSON.stringify(requestBody);

    console.log(`[Tab ${tabId}] Making media analysis request for ${mediaType} (${mediaUrl}) using stored token.`);
    console.log(`[Tab ${tabId}] Request Body: ${requestBodyString}`);

    fetch(targetUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${currentAuthToken}` // Use the stored token
        },
        body: requestBodyString
    })
    .then(async response => {
        console.log(`[Tab ${tabId}] Media Item Analysis API Response Status (${mediaUrl}):`, response.status);
        if (response.status === 401) {
            console.error(`[Tab ${tabId}] Backend returned 401 for media ${mediaUrl}. Stored token likely invalid/expired.`);
            await handleSignOut(); // Sign out the user
            throw new Error(`Authentication failed (401). Please sign in again.`);
        } else if (response.status === 403) {
            console.warn(`[Tab ${tabId}] Backend returned 403 for media ${mediaUrl}. Likely tier restriction.`);
            let errorDetail = "Authorization failed (403).";
            try { const errorJson = await response.json(); errorDetail = errorJson.error || errorDetail; } catch (e) {}
            throw new Error(errorDetail);
        }
        if (!response.ok) {
            const errorText = await response.text();
            let errorDetail = errorText;
            try { const errorJson = JSON.parse(errorText); errorDetail = errorJson.error || errorText; } catch(e) {}
            throw { status: response.status, message: `HTTP ${response.status}: ${errorDetail}` };
        }
        return response.json();
    })
    .then(result => {
        console.log(`[Tab ${tabId}] Media analysis result received for ${mediaUrl}:`, result);
        
        const responseData = {
            mediaId: mediaId,
            mediaType: mediaType,
            summary: result?.analysis_summary,
            error: result?.error,
            status: result?.status,
            manipulation_confidence: result?.manipulation_confidence,
            manipulated_found: result?.manipulated_images_found ?? result?.manipulated_videos_found ?? result?.manipulated_audios_found,
            parsed_text: result?.manipulated_media?.[0]?.parsed_text,
            ai_generated_score: result?.manipulated_media?.[0]?.ai_generated,
            ocr_error: result?.manipulated_media?.[0]?.ocr_error,
            manipulation_error: result?.manipulated_media?.[0]?.manipulation_error
        };
        
        console.log(`[Tab ${tabId}] Attempting to send displayMediaAnalysis for mediaId ${mediaId} with data:`, responseData);
        chrome.tabs.sendMessage(tabId, { action: "displayMediaAnalysis", data: responseData })
            .then(() => console.log(`[Tab ${tabId}] Successfully sent displayMediaAnalysis for mediaId ${mediaId}`))
            .catch(err => console.error(`[Tab ${tabId}] Error sending displayMediaAnalysis for mediaId ${mediaId}:`, err));
            
        // Also store in processingState for sidepanel access
        if (!processingState[tabId]) processingState[tabId] = {};
        if (!processingState[tabId].mediaItems) processingState[tabId].mediaItems = {};
        processingState[tabId].mediaItems[mediaUrl] = { status: 'complete', data: responseData };
        
        chrome.runtime.sendMessage({ action: "mediaItemUpdate", tabId: tabId, url: mediaUrl, result: { status: 'complete', data: responseData } })
            .catch(err => console.log(`Error notifying UI of media item completion:`, err));
        
        sendResponse({ status: "success", resultReceived: true });
    })
    .catch(error => {
        const errorMessage = error.message || "Unknown media analysis error";
        console.error(`[Tab ${tabId}] ❌ Error during media item analysis fetch for ${mediaUrl}. Full Error:`, error);
        
        chrome.tabs.sendMessage(tabId, { action: "displayMediaAnalysis", data: { mediaId: mediaId, mediaType: mediaType, status: 'error', error: errorMessage }})
            .catch(err => console.log(`[Tab ${tabId}] Error sending displayMediaAnalysis (error) to content script:`, err));
            
        // Also store error in processingState for sidepanel access
        if (!processingState[tabId]) processingState[tabId] = {};
        if (!processingState[tabId].mediaItems) processingState[tabId].mediaItems = {};
        processingState[tabId].mediaItems[mediaUrl] = { status: 'error', error: errorMessage };
        
        chrome.runtime.sendMessage({ action: "mediaItemUpdate", tabId: tabId, url: mediaUrl, result: { status: 'error', error: errorMessage } })
            .catch(err => console.log(`Error notifying UI of media fetch error:`, err));
            
        sendResponse({ status: "error", error: errorMessage });
    });

    return true; // Indicate async response
  }

  // --- getResultForTab ---
  if (message.action === "getResultForTab") {
      const targetTabId = message.tabId;
      console.log(`📊 Request for results for tab ${targetTabId}`);

      if (!currentAuthToken) {
          console.log(`[Tab ${targetTabId}] No auth token, sending signed_out status.`);
          sendResponse({ status: "signed_out" });
          return false;
      }

      if (processingState[targetTabId]) {
          const dataToSend = {
              textResult: processingState[targetTabId].textResult || null,
              mediaResult: processingState[targetTabId].mediaResult || null,
              mediaItems: processingState[targetTabId].mediaItems || {},
              sentimentBiasResult: processingState[targetTabId].sentimentBiasResult || null
          };
          console.log(`[Tab ${targetTabId}] Sending data:`, dataToSend);
          sendResponse({ status: "found", data: dataToSend });
      } else {
          console.log(`[Tab ${targetTabId}] No processing state found.`);
          sendResponse({ status: "not_found" });
      }
      return false;
  }

  return false;
});

checkInitialAuthState().catch(e => console.error("Error during initial auth state check:", e));

console.log("Background script loaded and running.");
