// Function to check if background script is ready
async function ensureBackgroundScriptReady() {
  return new Promise((resolve) => {
    const attemptPing = () => {
      chrome.runtime.sendMessage({ action: "ping" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Background script not ready, retrying...");
          setTimeout(attemptPing, 150); // Slightly increased retry delay
        } else {
          console.log("Background script ready");
          resolve();
        }
      });
    };
    attemptPing();
  });
}

// Function to safely send message with retry
async function sendMessageWithRetry(message, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    function trySend() {
      attempts++;
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.log(` Attempt ${attempts} failed:`, chrome.runtime.lastError);
          if (attempts < maxRetries) {
            setTimeout(trySend, 1000); // Wait 1 second before retry
          } else {
            reject(new Error(`Failed after ${maxRetries} attempts: ${chrome.runtime.lastError.message}`));
          }
        } else {
          resolve(response);
        }
      });
    }
    
    trySend();
  });
}

// State management
let currentTabId = null;
let currentUrl = null;

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

async function getThemePreference() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['theme'], (result) => {
      resolve(result.theme || 'system'); // Default to system
    });
  });
}

function applyTheme(themePreference) {
  const htmlElement = document.documentElement;
  htmlElement.classList.remove('light', 'dark'); // Remove existing theme classes

  let themeToApply = themePreference;
  if (themePreference === 'system') {
    themeToApply = prefersDark.matches ? 'dark' : 'light';
  }

  if (themeToApply === 'dark') {
    htmlElement.classList.add('dark');
  } else {
    htmlElement.classList.add('light'); // Explicitly add light class
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async function() {
  console.log("Popup initialized");

  // Initialize Theme based on storage
  const initialTheme = await getThemePreference();
  applyTheme(initialTheme);
  prefersDark.addEventListener('change', async () => {
      // Re-apply theme if system preference changes and current setting is 'system'
      const currentStoredTheme = await getThemePreference();
      if (currentStoredTheme === 'system') {
          applyTheme('system');
      }
  });

  try {
    // Ensure background script is ready
    await ensureBackgroundScriptReady();

    // Get current tab
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) {
      throw new Error("No active tab found");
    }
    currentTabId = tab.id;
    currentUrl = tab.url;
    console.log("Current tab:", currentUrl);

    // Setup action button
    const actionButton = document.getElementById('actionButton');
    actionButton.addEventListener('click', async function() {
      console.log("Opening side panel");
      try {
        await chrome.sidePanel.open({ tabId: currentTabId });
      } catch (error) {
        console.error("Error opening side panel:", error);
      }
    });

    // Get the latest analysis for this URL
    chrome.storage.local.get(['lastAnalysis'], async function(result) {
      if (result.lastAnalysis && result.lastAnalysis.url === currentUrl) {
        console.log("Found existing analysis:", result.lastAnalysis);
        const status = result.lastAnalysis.label === "LABEL_1" ? 'fake' : 'real';
        updateUI(status);
      } else {
        console.log("No existing analysis found or URL mismatch, starting new analysis");
        updateUI('unknown');
        if (currentUrl && (currentUrl.startsWith('http:') || currentUrl.startsWith('https:'))) {
           await requestAnalysis();
        } else {
            console.log("Skipping analysis for non-http(s) URL:", currentUrl);
            updateUI('unknown');
            document.getElementById('statusMessage').textContent = 'Analysis unavailable for this page.';
        }
      }
    });

    // Listen for analysis and theme updates from storage
    chrome.storage.onChanged.addListener(async (changes, namespace) => {
      if (namespace === 'local') {
          if (changes.lastAnalysis) {
            const newAnalysis = changes.lastAnalysis.newValue;
            console.log("Analysis updated:", newAnalysis);

            // Check if the update is for the current URL before updating UI
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            if (tab && newAnalysis && newAnalysis.url === tab.url) {
              const status = newAnalysis.label === "LABEL_1" ? 'fake' : 'real';
              updateUI(status);
            } else if (!tab) {
                console.log("No active tab found, cannot compare URL for analysis update.");
            }
          }
          // Listen for theme changes initiated by the sidepanel
          if (changes.theme) {
              const newTheme = changes.theme.newValue || 'system';
              console.log("Theme changed in storage:", newTheme);
              applyTheme(newTheme);
          }
      }
    });

  } catch (error) {
    console.error("Error in popup initialization:", error);
    updateUI('unknown');
    document.getElementById('statusMessage').textContent = 'Initialization error.';
  }
});

// Request content analysis
async function requestAnalysis() {
  if (!currentTabId || !(currentUrl && (currentUrl.startsWith('http:') || currentUrl.startsWith('https:')))) {
      console.log("Skipping analysis request for invalid tab/URL.");
      return;
  }

  try {
    console.log("Requesting analysis from content script for tab:", currentTabId);
    // Send message to content script to start analysis
    await chrome.tabs.sendMessage(currentTabId, {
      action: 'analyzeContent'
    });
    console.log("Analysis request sent.");
  } catch (error) {
    console.error('Failed to request analysis:', error);
    // If content script isn't ready, inject it and retry
    console.log("Content script might not be ready, attempting injection.");
    await injectContentScript();
    // Wait a bit for the script to load before retrying
    setTimeout(async () => {
      try {
        console.log("Retrying analysis request after injection.");
        await chrome.tabs.sendMessage(currentTabId, {
          action: 'analyzeContent'
        });
         console.log("Retry analysis request sent.");
      } catch (retryError) {
        console.error('Retry failed:', retryError);
        updateUI('unknown'); // Show error state
        document.getElementById('statusMessage').textContent = 'Failed to analyze content.';
      }
    }, 500); // Increased delay slightly
  }
}

async function injectContentScript() {
  try {
    console.log("Injecting content script into tab:", currentTabId);
    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      files: ['content.js']
    });
    console.log("Content script injected successfully.");
  } catch (error) {
    // Ignore errors if the script is already injected or the page is restricted
    if (error.message.includes('Cannot access') || error.message.includes('Receiving end does not exist') || error.message.includes('Cannot create script')) {
        console.warn('Could not inject content script (might be restricted page, already injected, or invalid context):', error.message);
    } else {
        console.error('Failed to inject content script:', error);
    }
  }
}

// Function to update UI based on analysis result
function updateUI(status) {
  const statusIndicator = document.getElementById('statusIndicator');
  const actionButton = document.getElementById('actionButton');
  const statusMessage = document.getElementById('statusMessage');

  // Remove existing status classes
  actionButton.classList.remove('bg-green-600', 'hover:bg-green-700', 'bg-red-600', 'hover:bg-red-700', 'bg-indigo-600', 'hover:bg-indigo-700');
  actionButton.classList.remove('dark:bg-green-700', 'dark:hover:bg-green-800', 'dark:bg-red-700', 'dark:hover:bg-red-800', 'dark:bg-indigo-500', 'dark:hover:bg-indigo-600');

  // Remove pulse animation when result is available
  if (status !== 'unknown') {
    statusIndicator.classList.remove('pulse-animation');
  } else {
    statusIndicator.classList.add('pulse-animation');
  }

  // Add new status class if result is available
  if (status === 'real') {
    actionButton.textContent = 'View Verification';
    statusMessage.textContent = 'This content appears to be authentic';
    statusIndicator.className = 'status-indicator real';
    statusIndicator.innerHTML = `
      <div class="flex items-center gap-1.5">
        <div class="icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <span>Verified</span>
      </div>
    `;
  } else if (status === 'fake') {
    actionButton.textContent = 'View Issues';
    statusMessage.textContent = 'This content may be misleading';
    statusIndicator.className = 'status-indicator fake';
    statusIndicator.innerHTML = `
      <div class="flex items-center gap-1.5">
        <div class="icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <span>Misleading</span>
      </div>
    `;
  } else { // 'unknown' state
    actionButton.textContent = 'View Details';
    statusMessage.textContent = 'Checking content authenticity...';
    statusIndicator.className = 'status-indicator unknown pulse-animation';
    statusIndicator.innerHTML = `
      <div class="flex items-center gap-1.5">
        <div class="icon">
          <svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <span>Analyzing</span>
      </div>
    `;
  }
  // Re-apply theme based on current preference in case styles depend on it
  getThemePreference().then(applyTheme);
}