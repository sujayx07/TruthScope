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

// Listen for text selection events
document.addEventListener('mouseup', async function() {
  const selectedText = window.getSelection().toString().trim();
  
  if (selectedText) {
    try {
      // Ensure background script is ready
      await ensureBackgroundScriptReady();
      
      // Log the extracted selected text
      console.log("Text selected:", selectedText);
      
      // Send selected text to the background script
      chrome.runtime.sendMessage({
        action: "textSelected",
        data: selectedText
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError);
        }
      });
    } catch (error) {
      console.error("Error in content script:", error);
    }
  }
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSelectedText") {
    const selectedText = window.getSelection().toString().trim();
    sendResponse({ text: selectedText });
  }
});
