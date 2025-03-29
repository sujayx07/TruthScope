// Function to check if background script is ready
async function ensureBackgroundScriptReady() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        // If background script isn't ready, wait and try again
        setTimeout(() => ensureBackgroundScriptReady().then(resolve), 100);
      } else {
        resolve();
      }
    });
  });
}

// Keep track of last selection to avoid duplicate analysis
let lastSelection = '';
const DEBOUNCE_DELAY = 300;

// Function to handle text selection
function handleSelection() {
  const selection = window.getSelection().toString().trim();
  
  if (selection && selection !== lastSelection && selection.split(/\s+/).length > 3) {
    console.log("📝 New text selection detected:", selection);
    lastSelection = selection;
    
    // Send selected text for analysis
    chrome.runtime.sendMessage({ 
      action: "analyzeText",
      data: selection
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Extension context invalidated:', chrome.runtime.lastError);
      } else if (response && response.error) {
        console.error('Analysis error:', response.error);
      }
    });
  }
}

// Debounced selection handler
document.addEventListener('mouseup', () => {
  setTimeout(handleSelection, DEBOUNCE_DELAY);
});

// Keep-alive for background script
setInterval(() => {
  chrome.runtime.sendMessage({ action: "ping" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('Keep-alive failed:', chrome.runtime.lastError);
    }
  });
}, 10000);

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSelectedText") {
    const selectedText = window.getSelection().toString().trim();
    sendResponse({ text: selectedText });
  }
});
