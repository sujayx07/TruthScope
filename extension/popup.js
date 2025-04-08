// Function to check if background script is ready
async function ensureBackgroundScriptReady() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log(" Background script not ready, retrying...");
        setTimeout(() => ensureBackgroundScriptReady().then(resolve), 100);
      } else {
        console.log(" Background script ready");
        resolve();
      }
    });
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

// Initialize popup
document.addEventListener('DOMContentLoaded', async function() {
  console.log("Popup initialized");
  
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
        // Show existing analysis
        const status = result.lastAnalysis.label === "LABEL_1" ? 'fake' : 'real';
        updateUI(status);
      } else {
        console.log("No existing analysis found, starting new analysis");
        // Start new analysis
        updateUI('unknown');
        await requestAnalysis();
      }
    });

    // Listen for analysis updates
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.lastAnalysis) {
        const newAnalysis = changes.lastAnalysis.newValue;
        console.log("Analysis updated:", newAnalysis);
        
        if (newAnalysis && newAnalysis.url === currentUrl) {
          const status = newAnalysis.label === "LABEL_1" ? 'fake' : 'real';
          updateUI(status);
        }
      }
    });
  } catch (error) {
    console.error("Error in popup initialization:", error);
    updateUI('unknown');
  }
});

// Request content analysis
async function requestAnalysis() {
  if (!currentTabId) return;

  try {
    // Send message to content script to start analysis
    await chrome.tabs.sendMessage(currentTabId, {
      action: 'analyzeContent'
    });
  } catch (error) {
    console.error('Failed to request analysis:', error);
    // If content script isn't ready, inject it and retry
    await injectContentScript();
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(currentTabId, {
          action: 'analyzeContent'
        });
      } catch (retryError) {
        console.error('Retry failed:', retryError);
      }
    }, 100);
  }
}

// Inject content script if not already present
async function injectContentScript() {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      files: ['content.js']
    });
  } catch (error) {
    console.error('Failed to inject content script:', error);
  }
}

// Function to update UI based on analysis result
function updateUI(status) {
  const bgGradient = document.getElementById('bgGradient');
  const statusIndicator = document.getElementById('statusIndicator');
  const actionButton = document.getElementById('actionButton');
  const statusMessage = document.getElementById('statusMessage');
  
  // Remove existing status classes
  bgGradient.classList.remove('real', 'fake');
  actionButton.classList.remove('default', 'real', 'fake');
  
  // Remove pulse animation when result is available
  if (status !== 'unknown') {
    statusIndicator.classList.remove('pulse-animation');
  } else {
    statusIndicator.classList.add('pulse-animation');
  }
  
  // Add new status class if result is available
  if (status === 'real') {
    bgGradient.classList.add('real');
    actionButton.classList.add('real');
    actionButton.textContent = 'View Verification';
    statusMessage.textContent = 'This content appears to be authentic';
    statusMessage.className = 'text-sm text-green-700 font-medium';
    
    // Update status indicator
    statusIndicator.className = 'status-indicator real';
    statusIndicator.innerHTML = `
      <div class="flex items-center gap-1.5">
        <div class="icon text-green-600">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <span>Verified</span>
      </div>
    `;
  } else if (status === 'fake') {
    bgGradient.classList.add('fake');
    actionButton.classList.add('fake');
    actionButton.textContent = 'View Issues';
    statusMessage.textContent = 'This content may be misleading';
    statusMessage.className = 'text-sm text-red-700 font-medium';
    
    // Update status indicator
    statusIndicator.className = 'status-indicator fake';
    statusIndicator.innerHTML = `
      <div class="flex items-center gap-1.5">
        <div class="icon text-red-600">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <span>Misleading</span>
      </div>
    `;
  } else {
    actionButton.classList.add('default');
    actionButton.textContent = 'View Details';
    statusMessage.textContent = 'Checking content authenticity...';
    statusMessage.className = 'text-sm text-gray-600';
    
    // Update status indicator
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
}