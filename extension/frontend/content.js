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

// --- Start of Media Analysis Button Injection ---

// Inject CSS for buttons and result boxes
function injectStyles() {
    const style = document.createElement('style');
    // Use backticks directly for template literal
    style.textContent = `
        .truthscope-media-container {
            position: relative;
            display: inline-block; /* Adjust as needed */
        }
        .truthscope-analyze-button {
            position: absolute;
            top: 5px;
            right: 5px;
            z-index: 9999;
            padding: 3px 6px;
            font-size: 10px;
            cursor: pointer;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 3px;
            opacity: 0.7;
            transition: opacity 0.2s;
        }
        .truthscope-analyze-button:hover {
            opacity: 1;
        }
        .truthscope-analysis-result {
            position: absolute;
            bottom: 5px; /* Position relative to container */
            left: 5px;
            z-index: 9998;
            background-color: rgba(255, 255, 255, 0.9);
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 5px;
            font-size: 12px;
            color: #333;
            max-width: calc(100% - 10px); /* Prevent overflow */
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
    `;
    document.head.appendChild(style);
}

// Store analysis results temporarily
const analysisResults = {}; // Key: mediaId, Value: resultText
const mediaElementMap = {}; // Key: mediaId, Value: buttonElement

// Function to inject analysis button
let mediaCounter = 0;
function injectAnalysisButton(mediaElement) {
    const mediaType = mediaElement.tagName.toLowerCase(); // 'img', 'video', 'audio'
    let mediaSrc = mediaElement.src;

    // Extract source for video/audio if direct src is not set
    if ((mediaType === 'video' || mediaType === 'audio') && !mediaSrc) {
        const sourceElement = mediaElement.querySelector('source');
        if (sourceElement) {
            mediaSrc = sourceElement.src;
        }
    }

    if (!mediaSrc) {
        // Try getting currentSrc for elements where src might not be initially set
        mediaSrc = mediaElement.currentSrc;
        if (!mediaSrc) {
            console.log('Skipping media element without valid src/currentSrc:', mediaElement);
            return; // Skip elements without a source
        }
    }

    // Ensure the element has a unique ID for referencing
    const mediaId = `truthscope-media-${mediaCounter++}`;
    mediaElement.dataset.truthscopeId = mediaId; // Add data attribute

    // Create a wrapper for positioning if needed (simple check)
    let container = mediaElement.parentElement;
    if (getComputedStyle(container).position === 'static') {
         // Check if parent is already a container or if we need a new one
        if (!container.classList.contains('truthscope-media-container')) {
            const wrapper = document.createElement('div');
            wrapper.classList.add('truthscope-media-container');
            mediaElement.parentNode.insertBefore(wrapper, mediaElement);
            wrapper.appendChild(mediaElement);
            container = wrapper;
        }
    } else {
         // Parent is already positioned, add class if not present
         if (!container.classList.contains('truthscope-media-container')) {
             container.classList.add('truthscope-media-container');
         }
    }


    const button = document.createElement('button');
    button.textContent = 'Analyze';
    button.classList.add('truthscope-analyze-button');
    button.dataset.mediaId = mediaId; // Link button to media element

    button.addEventListener('click', async (event) => {
        event.stopPropagation(); // Prevent triggering video play/pause etc.
        event.preventDefault();
        console.log(`Analyze button clicked for ${mediaType}: ${mediaSrc}`);
        button.textContent = 'Analyzing...'; // Provide feedback
        button.disabled = true;

        try {
            await ensureBackgroundScriptReady();
            // Use 'processMediaItem' action to match background.js handler
            // Send mediaId along with other data
            await safeSendMessage({
                action: "processMediaItem",
                data: {
                    mediaUrl: mediaSrc, // Match expected key in background.js
                    mediaType: mediaType,
                    mediaId: mediaId // Send ID to background
                }
            });
            // Result will be displayed via message listener 'displayMediaAnalysis'
            // The simple response from background.js isn't used here for display
        } catch (error) {
            console.error('Error sending media analysis request:', error);
            // Display error locally if sending fails
            displayAnalysisResult(mediaId, `Error sending request: ${error.message || 'Unknown error'}`);
            // Button state is reset within displayAnalysisResult
        }
    });

    // Append button to the container (which now wraps the media element)
    container.appendChild(button);
    mediaElementMap[mediaId] = button; // Store button reference
}

// Function to display analysis result
function displayAnalysisResult(mediaId, resultText) {
    const button = mediaElementMap[mediaId];
    if (!button || !button.parentElement) {
        console.error(`Could not find container for mediaId: ${mediaId}`);
        return;
    }

    // Remove existing result if any
    const existingResult = button.parentElement.querySelector(`.truthscope-analysis-result[data-media-id="${mediaId}"]`);
    if (existingResult) {
        existingResult.remove();
    }

    const resultDiv = document.createElement('div');
    resultDiv.classList.add('truthscope-analysis-result');
    resultDiv.dataset.mediaId = mediaId; // Link result to media element
    // <<< Directly display the received text (summary or error) >>>
    resultDiv.textContent = resultText;

    // Append result to the same container as the button
    button.parentElement.appendChild(resultDiv);

    // Reset button state
    button.textContent = 'Analyze';
    button.disabled = false;
}

// Function to find and add buttons to media elements
function addAnalysisButtonsToMedia() {
    console.log("Searching for media elements to add buttons...");
    const mediaElements = document.querySelectorAll('img, video, audio');
    mediaElements.forEach(el => {
        // Basic filtering: avoid tiny icons, ensure visibility?
        if (el.offsetWidth > 50 && el.offsetHeight > 50 || el.tagName.toLowerCase() === 'audio') { // Example filter
             // Check if button already exists
            const mediaId = el.dataset.truthscopeId;
            if (!mediaId || !mediaElementMap[mediaId]) {
                injectAnalysisButton(el);
            }
        }
    });
    console.log(`Found ${mediaElements.length} media elements, added buttons where applicable.`);
}

// --- End of Media Analysis Button Injection ---

// Main initialization
async function init() {
  try {
    injectStyles(); // Inject CSS styles first

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
            // sendMediaData(url, mediaSources) // Commented out call
        ]);

        // Inject buttons after initial processing
        addAnalysisButtonsToMedia();

        // Use MutationObserver to detect dynamically added media
        const observer = new MutationObserver((mutationsList) => {
            for(const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if the added node itself is media
                            if (['IMG', 'VIDEO', 'AUDIO'].includes(node.tagName)) {
                                if (node.offsetWidth > 50 && node.offsetHeight > 50 || node.tagName === 'AUDIO') {
                                     if (!node.dataset.truthscopeId) { // Check if not already processed
                                        injectAnalysisButton(node);
                                    }
                                }
                            }
                            // Check if the added node contains media elements
                            node.querySelectorAll('img, video, audio').forEach(el => {
                                if (el.offsetWidth > 50 && el.offsetHeight > 50 || el.tagName === 'AUDIO') {
                                     if (!el.dataset.truthscopeId) { // Check if not already processed
                                        injectAnalysisButton(el);
                                    }
                                }
                            });
                        }
                    });
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

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
        return true; // Indicate async response potentially
    }

    // --- Handle Media Analysis Result ---
    if (message.action === "displayMediaAnalysis") {
        // <<< Expect summary or error directly >>>
        const { mediaId, summary, error } = message.data;

        if (mediaId) {
            if (error) {
                console.error(`Analysis error for ${mediaId}: ${error}`);
                displayAnalysisResult(mediaId, `Error: ${error}`);
            } else if (summary !== undefined) { // Check if summary exists (could be empty string)
                console.log(`Displaying analysis summary for ${mediaId}:`, summary);
                displayAnalysisResult(mediaId, summary);
            } else {
                console.warn(`Received displayMediaAnalysis for ${mediaId} without summary or error.`);
                displayAnalysisResult(mediaId, "Received empty response.");
            }
            sendResponse({ status: "result processed" });
        } else {
            console.error("Invalid media analysis result data (missing mediaId):", message.data);
            sendResponse({ status: "error", error: "Invalid result data (missing mediaId)" });
        }
        return true; // Indicate async response potentially
    }
    // --- End Handle Media Analysis Result ---

    // --- Handle Text Analysis Error ---
    if (message.action === "analysisError") {
        // This specifically catches errors sent from the background script
        // (e.g., during text analysis fetch failure)
        console.error("Received analysis error from background script:", message.error);
        // Optionally, display a generic error message on the page?
        // e.g., showTemporaryMessage(`Analysis Error: ${message.error}`);
        sendResponse({ status: "error processed" });
        return true; // Indicate async response potentially
    }
    // --- End Handle Text Analysis Error ---


  } catch (error) {
    console.error('Error handling message:', error);
    // Ensure response is sent even in case of unexpected errors
    if (sendResponse && typeof sendResponse === 'function' && !sendResponse._called) { // Basic check if sendResponse is valid and not called
        try {
            sendResponse({ status: "error", error: error.message });
        } catch (e) {
            console.error("Failed to send error response:", e);
        }
    }
    return true; // Keep channel open
  }
  // Return false or undefined for synchronous messages if no longer waiting
  // return false; // Removed the duplicate listener below
});
