// Define backend endpoints
const TEXT_ANALYSIS_URL = "http://127.0.0.1:5000/analyze";
const IMAGE_ANALYSIS_URL = "http://127.0.0.1:3000/analyze_image";
const VIDEO_ANALYSIS_URL = "http://127.0.0.1:3000/analyze_video";
const AUDIO_ANALYSIS_URL = "http://127.0.0.1:3000/analyze_audio";
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';
const GOOGLE_REVOKE_URL = 'https://accounts.google.com/o/oauth2/revoke?token=';

// Keep track of active connections and processing state per tab
let activeConnections = new Set();
let processingState = {}; // { tabId: { textResult: ..., mediaResult: ..., mediaItems: { url: result, ... } } }

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

  // --- NEW: Authentication Actions ---
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
  // --- End Authentication Actions ---


  if (message.action === "ping") {
    sendResponse({ status: "ready" });
    return true;
  }

  // --- Modified: processText ---
  if (message.action === "processText" && tabId) {
    console.log(`📝 [Tab ${tabId}] Received text for analysis:`, message.data.url);
    const { url, articleText } = message.data;

    // *** Auth Check ***
    // Make the check more explicit
    if (!currentAuthToken) {
        console.warn(`[Tab ${tabId}] Auth check failed: currentAuthToken is missing. Skipping text analysis.`);
        sendResponse({ status: "error", error: "User not signed in." });
        chrome.tabs.sendMessage(tabId, { action: "analysisError", error: "Authentication required." })
            .catch(err => console.log(`[Tab ${tabId}] Error sending auth error to content script:`, err));
        return false;
    }
    if (!userProfile || !userProfile.id) {
         console.warn(`[Tab ${tabId}] Auth check failed: userProfile or userProfile.id is missing. Profile: ${JSON.stringify(userProfile)}. Skipping text analysis.`);
         // Don't sign out here, just prevent the call
         sendResponse({ status: "error", error: "User profile information is missing." });
         chrome.tabs.sendMessage(tabId, { action: "analysisError", error: "User profile missing. Please try signing out and back in." })
             .catch(err => console.log(`[Tab ${tabId}] Error sending profile error to content script:`, err));
         return false;
    }

    if (!articleText || articleText.length < 25) {
        console.warn(`[Tab ${tabId}] Text content too short, skipping analysis.`);
        sendResponse({ status: "skipped", reason: "Content too short" });
        return false;
    }
    const textToSend = articleText.slice(0, 3000);
    const userIdToSend = userProfile.id; // Store in a variable to be sure

    // Log state right before fetch
    console.log(`[Tab ${tabId}] Making text analysis request. Token exists: ${!!currentAuthToken}, User ID: ${userIdToSend}`);

    fetch(TEXT_ANALYSIS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${currentAuthToken}` // *** Add Auth Header ***
      },
      body: JSON.stringify({
          url: url,
          article_text: textToSend,
          google_user_id: userIdToSend // Send the stored ID
      })
    })
      .then(async response => {
        console.log(`[Tab ${tabId}] Text Analysis API Response Status:`, response.status);
        // *** Handle Auth Error from Backend ***
        if (response.status === 401 || response.status === 403) {
            console.error(`[Tab ${tabId}] Backend returned ${response.status}. Token might be invalid or expired.`);
            await handleSignOut(); // Sign out the user
            throw new Error(`Authentication failed (${response.status}). Please sign in again.`);
        }
        if (!response.ok) {
          // ... (existing error handling for non-auth errors) ...
          const errorText = await response.text();
          let errorDetail = errorText;
          try { const errorJson = JSON.parse(errorText); errorDetail = errorJson.error || errorText; } catch(e) {}
          throw new Error(`HTTP ${response.status}: ${errorDetail}`);
        }
        return response.json();
      })
      .then(result => {
        // ... (existing success handling logic) ...
        console.log(`[Tab ${tabId}] Backend analysis result:`, result);

        if (result && result.error) {
            console.error(`[Tab ${tabId}] Backend returned an error: ${result.error}`);
            if (!processingState[tabId]) processingState[tabId] = {};
            processingState[tabId].textResult = { error: result.error };
            chrome.tabs.sendMessage(tabId, {
                action: "analysisError",
                error: result.error
            }).catch(err => console.log(`[Tab ${tabId}] Error sending analysisError to content script:`, err));
            // Don't sendResponse here, let the final catch handle it or send success below
        } else if (result && result.textResult) {
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
            return; // Exit early on success
        } else {
             console.error(`[Tab ${tabId}] Backend response did not contain expected 'textResult'. Response:`, result);
             if (!processingState[tabId]) processingState[tabId] = {};
             processingState[tabId].textResult = { error: "Invalid response format from backend." };
             chrome.tabs.sendMessage(tabId, {
                 action: "analysisError",
                 error: "Invalid response format from backend."
             }).catch(err => console.log(`[Tab ${tabId}] Error sending analysisError (invalid format) to content script:`, err));
             // Let the catch block handle sending the error response
             throw new Error("Invalid response format from backend.");
        }
      })
      .catch(error => {
        // ... (existing catch block logic) ...
        console.error(`[Tab ${tabId}] ❌ Error during text analysis fetch:`, error);
        if (!processingState[tabId]) processingState[tabId] = {};
        // Ensure error message is stored
        const errorMessage = error.message || "Unknown text analysis error";
        processingState[tabId].textResult = { error: errorMessage };

        chrome.tabs.sendMessage(tabId, {
            action: "analysisError",
            error: errorMessage
        }).catch(err => console.log(`[Tab ${tabId}] Error sending analysisError to content script:`, err));

        sendResponse({ status: "error", error: errorMessage });
      });

    return true; // Indicate async response
  }

  // --- Modified: processMediaItem ---
  if (message.action === "processMediaItem" && tabId) {
      const { mediaUrl, mediaType, mediaId } = message.data;
      console.log(`🖼️ [Tab ${tabId}] Received ${mediaType} for analysis: ${mediaUrl} (ID: ${mediaId})`);

      // *** Auth Check ***
      // Make the check more explicit
      if (!currentAuthToken) {
          console.warn(`[Tab ${tabId}] Auth check failed: currentAuthToken is missing. Skipping media analysis for ${mediaUrl}.`);
          chrome.tabs.sendMessage(tabId, { action: "displayMediaAnalysis", data: { mediaId: mediaId, error: "Authentication required." }})
              .catch(err => console.log(`[Tab ${tabId}] Error sending media auth error to content script:`, err));
          sendResponse({ status: "error", error: "User not signed in." });
          return false;
      }
       if (!userProfile || !userProfile.id) {
           console.warn(`[Tab ${tabId}] Auth check failed: userProfile or userProfile.id is missing. Profile: ${JSON.stringify(userProfile)}. Skipping media analysis for ${mediaUrl}.`);
           chrome.tabs.sendMessage(tabId, { action: "displayMediaAnalysis", data: { mediaId: mediaId, error: "User profile missing. Please try signing out and back in." }})
               .catch(err => console.log(`[Tab ${tabId}] Error sending profile error to content script:`, err));
           sendResponse({ status: "error", error: "User profile information is missing." });
           return false;
       }

      // ... (existing validation for mediaUrl, mediaType, mediaId) ...
      if (!mediaUrl || !mediaType || !mediaId) {
          console.warn(`[Tab ${tabId}] Invalid media item data received.`);
          chrome.tabs.sendMessage(tabId, {
              action: "displayMediaAnalysis",
              data: { mediaId: mediaId || 'unknown', error: "Invalid media data received by background script." }
          }).catch(err => console.log(`[Tab ${tabId}] Error sending invalid data error to content script:`, err));
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
              chrome.tabs.sendMessage(tabId, {
                  action: "displayMediaAnalysis",
                  data: { mediaId: mediaId, error: `Unsupported media type: ${mediaType}` }
              }).catch(err => console.log(`[Tab ${tabId}] Error sending unsupported type error to content script:`, err));
              sendResponse({ status: "error", error: `Unsupported media type: ${mediaType}` });
              return false;
      }

      const userIdToSendMedia = userProfile.id; // Store in a variable
      // *** ADDED LOGGING ***
      console.log(`[Tab ${tabId}] Preparing media analysis request. User ID to send: '${userIdToSendMedia}' (Type: ${typeof userIdToSendMedia})`);
      // *** END ADDED LOGGING ***

      const requestBody = {
          media_url: mediaUrl,
          google_user_id: userIdToSendMedia // Send the stored ID
      };
      const requestBodyString = JSON.stringify(requestBody); // Stringify for logging

      // Log state right before fetch, including the body
      console.log(`[Tab ${tabId}] Making media analysis request for ${mediaType}. Token exists: ${!!currentAuthToken}, User ID: ${userIdToSendMedia}`);
      console.log(`[Tab ${tabId}] Request Body: ${requestBodyString}`); // Log the stringified body

      fetch(targetUrl, {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Authorization": `Bearer ${currentAuthToken}` // Add Auth header for media requests too
          },
          body: requestBodyString // Send the stringified body
      })
      .then(async response => {
          console.log(`[Tab ${tabId}] Media Item Analysis API Response Status (${mediaUrl}):`, response.status);

          // *** Modified Auth/Authz Error Handling ***
          if (response.status === 401) { // Unauthorized (bad token/ID)
              console.error(`[Tab ${tabId}] Backend returned 401 for media ${mediaUrl}. Token might be invalid or expired.`);
              await handleSignOut(); // Sign out the user
              throw new Error(`Authentication failed (401). Please sign in again.`);
          } else if (response.status === 403) { // Forbidden (e.g., tier restriction)
              console.warn(`[Tab ${tabId}] Backend returned 403 for media ${mediaUrl}. Likely tier restriction.`);
              let errorDetail = "Authorization failed (403).";
              try {
                  const errorJson = await response.json(); // Try to get specific error from backend
                  errorDetail = errorJson.error || errorDetail;
              } catch (e) {
                  console.error(`[Tab ${tabId}] Could not parse JSON from 403 response body:`, e);
              }
              // DO NOT sign out. Throw the specific error.
              throw new Error(errorDetail);
          }
          // *** End Modified Auth/Authz Error Handling ***

          if (!response.ok) { // Handle other non-2xx errors
              const errorText = await response.text();
              let errorDetail = errorText;
              try { const errorJson = JSON.parse(errorText); errorDetail = errorJson.error || errorText; } catch(e) {} 
              // Use status and message for better error reporting in catch block
              throw { status: response.status, message: `HTTP ${response.status}: ${errorDetail}` };
          }
          // If response is OK (2xx), proceed to parse
          const responseText = await response.text();
          console.log(`[Tab ${tabId}] Media Response Text:`, responseText);
          // Add check for empty response text before parsing
          if (!responseText) {
              console.error(`[Tab ${tabId}] Received empty response body from media analysis for ${mediaUrl}.`);
              throw new Error("Received empty response from media analysis backend.");
          }
          const result = JSON.parse(responseText);
          return result;
      })
      .then(result => {
          // ... (existing success handling logic for media item) ...
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
          // Notify other UI components (optional)
          chrome.runtime.sendMessage({ action: "mediaAnalysisItemComplete", tabId: tabId, mediaUrl: mediaUrl, result: responseData })
              .catch(err => console.log(`Error notifying UI of media item completion:`, err));
          sendResponse({ status: "success", resultReceived: true });
      })
      .catch(error => {
          // ... (existing catch block logic for media item) ...
          const errorMessage = error.message || "Unknown media analysis error";
          console.error(`[Tab ${tabId}] ❌ Error during media item analysis fetch for ${mediaUrl}. Full Error:`, error);
          chrome.tabs.sendMessage(tabId, {
              action: "displayMediaAnalysis",
              data: { mediaId: mediaId, mediaType: mediaType, status: 'error', error: errorMessage }
          }).catch(err => console.log(`[Tab ${tabId}] Error sending displayMediaAnalysis (error) to content script:`, err));
          sendResponse({ status: "error", error: errorMessage });
      });

      return true; // Indicate async response
  }

  // --- Modified: getResultForTab ---
  if (message.action === "getResultForTab") {
      const targetTabId = message.tabId;
      console.log(`📊 Request for results for tab ${targetTabId}`);

      // *** Auth Check *** (Sidepanel should ideally check before sending, but double-check here)
      if (!currentAuthToken) {
          console.warn(`[Tab ${targetTabId}] Denying getResultForTab request - user not authenticated.`);
          sendResponse({ status: "auth_error", error: "User not signed in." }); // Send specific auth error status
          return false;
      }

      if (processingState[targetTabId]) {
          sendResponse({ status: "found", data: processingState[targetTabId] });
      } else {
          // If no processing state exists yet, maybe trigger analysis if appropriate?
          // For now, just report not found.
          console.log(`[Tab ${targetTabId}] No processing state found.`);
          sendResponse({ status: "not_found" });
      }
      return false; // Synchronous response (after checks)
  }


  // Default case
  return false;
});

// --- Existing Cleanup and Initialization --- (with added auth check on startup/install)
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log(`🗑️ Tab ${tabId} closed, removing stored results.`);
    delete processingState[tabId];
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((error) => console.error(error));
  checkInitialAuthState(); // Check auth state on install/update
});

// Check auth state when the extension starts up
chrome.runtime.onStartup.addListener(() => {
    checkInitialAuthState();
});

// Initial check when the script first loads (e.g., after enabling the extension)
checkInitialAuthState();
