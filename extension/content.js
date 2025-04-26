// Function to check if background script is ready
async function ensureBackgroundScriptReady() {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ action: "ping" }, (response) => {
        if (chrome.runtime.lastError) {
          // If background script isn't ready, wait and try again
          setTimeout(() => ensureBackgroundScriptReady().then(resolve).catch(reject), 100);
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Function to safely send message
async function safeSendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Keep-alive for background script
setInterval(() => {
  chrome.runtime.sendMessage({ action: "ping" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('Keep-alive failed:', chrome.runtime.lastError);
    }
  });
}, 10000);

// Function to extract article content
function extractArticleContent() {
  try {
    const selectors = [
      'article',
      '[role="article"]',
      '.article-content',
      '.post-content',
      'main',
      '.main-content'
    ];

    let articleElement = null;
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        articleElement = element;
        break;
      }
    }

    // If no article element found, use body content
    if (!articleElement) {
      articleElement = document.body;
    }

    // Extract text content
    const content = articleElement.innerText
      .replace(/\s+/g, ' ')
      .trim();

    return content;
  } catch (error) {
    console.error('Error extracting content:', error);
    return '';
  }
}

// Function to extract image and video sources
function extractMediaSources() {
  const imageSources = Array.from(document.querySelectorAll('img'))
                            .map(img => img.src)
                            .filter(src => src); // Filter out empty src attributes
  const videoSources = Array.from(document.querySelectorAll('video source')) // More specific selector for video sources
                            .map(source => source.src)
                            .filter(src => src);
  // Could also add document.querySelectorAll('video').map(v => v.src) if direct src is used
  return { imageSources, videoSources };
}

// Function to send text content for analysis
async function sendTextData(url, content) {
  if (!content || content.length < 100) { // Basic check for meaningful content
      console.log("Content too short or empty, skipping text analysis.");
      return;
  }
  try {
    console.log("Sending text data for analysis:", content.substring(0, 100) + "...");
    await ensureBackgroundScriptReady();

    await safeSendMessage({
      action: "processText", // New action name
      data: {
          url: url,
          articleText: content
      }
    });
    console.log("Text data sent successfully.");
  } catch (error) {
    console.error('Error sending text data:', error);
    // Handle error appropriately, maybe retry or notify user
  }
}

// Function to send media sources for analysis
async function sendMediaData(url, mediaSources) {
    if (mediaSources.imageSources.length === 0 && mediaSources.videoSources.length === 0) {
        console.log("No media found, skipping media analysis.");
        return;
    }
    try {
        console.log("Sending media data for analysis:", mediaSources);
        await ensureBackgroundScriptReady();

        await safeSendMessage({
            action: "processMedia", // New action name
            data: {
                url: url,
                imageSources: mediaSources.imageSources,
                videoSources: mediaSources.videoSources
            }
        });
        console.log("Media data sent successfully.");
    } catch (error) {
        console.error('Error sending media data:', error);
        // Handle error appropriately
    }
}


// Function to apply highlights to the page
// Basic implementation using find and replace - might be fragile.
// Consider using a library like Mark.js for robustness.
function applyHighlights(highlights) {
  if (!highlights || highlights.length === 0) return;

  console.log("Applying highlights:", highlights);
  const highlightStyle = 'background-color: yellow; color: black;'; // Example style
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;

  // Store nodes and highlight texts to modify later to avoid issues with walker invalidation
  const nodesToModify = [];

  while (node = walker.nextNode()) {
    if (node.parentElement && node.parentElement.tagName !== 'SCRIPT' && node.parentElement.tagName !== 'STYLE') {
      for (const textToHighlight of highlights) {
        if (node.nodeValue.includes(textToHighlight)) {
          nodesToModify.push({ node, textToHighlight });
        }
      }
    }
  }

  // Apply modifications
  nodesToModify.forEach(({ node, textToHighlight }) => {
      // Check if already highlighted or part of a highlight to prevent nested highlights
      if (node.parentElement.classList.contains('truthscope-highlight')) {
          return;
      }

      const regex = new RegExp(escapeRegExp(textToHighlight), 'g');
      const parent = node.parentNode;
      let currentNode = node;
      let match;

      // Process matches within the current text node
      while ((match = regex.exec(currentNode.nodeValue)) !== null) {
          const matchText = match[0];
          const matchIndex = match.index;

          // Split the text node
          const textBefore = currentNode.nodeValue.substring(0, matchIndex);
          const textAfter = currentNode.nodeValue.substring(matchIndex + matchText.length);

          // Create new text node for the text before the match
          if (textBefore) {
              parent.insertBefore(document.createTextNode(textBefore), currentNode);
          }

          // Create the highlight span
          const span = document.createElement('span');
          span.className = 'truthscope-highlight'; // Add a class for potential removal/styling
          span.style.cssText = highlightStyle;
          span.textContent = matchText;
          parent.insertBefore(span, currentNode);

          // Update the current node to the text after the match
          currentNode.nodeValue = textAfter;

          // Adjust regex lastIndex for the next search in the remaining text
          regex.lastIndex = 0; // Reset lastIndex as nodeValue has changed

          // If no text remaining, break loop for this node
          if (!textAfter) break;
      }
  });
}

// Helper function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// Function to check if URL is an article
function isArticlePage() {
  try {
    const url = window.location.href;
    const excludedPatterns = [
      /\.(jpg|jpeg|png|gif|pdf|doc|docx)$/i,
      /\/(search|login|signup|contact|about|privacy|terms)/i,
      /\?(q|search)=/i
    ];

    return !excludedPatterns.some(pattern => pattern.test(url));
  } catch (error) {
    console.error('Error checking article page:', error);
    return false;
  }
}

// Main initialization
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

// Initialize
init();

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log("Received message:", message);

    if (message.action === "getSelectedText") {
      const selectedText = window.getSelection().toString().trim();
      sendResponse({ text: selectedText });
      return true; // Keep channel open for async response
    }

    if (message.action === "applyHighlights") {
        if (message.highlights && Array.isArray(message.highlights)) {
            applyHighlights(message.highlights);
            sendResponse({ status: "highlights applied" });
        } else {
            console.error("Invalid highlight data received:", message.highlights);
            sendResponse({ status: "error", error: "Invalid highlight data" });
        }
        return true; // Indicate async response potentially (though applyHighlights is sync here)
    }

  } catch (error) {
    console.error('Error handling message:', error);
    // Ensure response is sent even in case of unexpected errors
    if (!sendResponse._called) {
        try {
            sendResponse({ status: "error", error: error.message });
        } catch (e) {
            console.error("Failed to send error response:", e);
        }
    }
    return true; // Keep channel open
  }
  // Return false or undefined for synchronous messages if no longer waiting
  // return false;
});

// Ensure sendResponse is always eventually called for async listeners
// This is tricky, the 'return true' pattern is key.
// Adding a safeguard in case logic paths miss it.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ... existing listener logic ...

    // If after processing, sendResponse hasn't been called, call it now.
    // This is a fallback, ideally logic paths should call sendResponse.
    // setTimeout(() => {
    //     if (!sendResponse._called) { // Check a flag if you set one
    //         console.log("Message listener timeout, sending default response for action:", message.action);
    //         // sendResponse({ status: "processed" }); // Or appropriate default
    //     }
    // }, 0); // Check immediately after sync execution

    return true; // Crucial for async operations within the listener
});
