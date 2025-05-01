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
        /* --- Compact Result Overlay for Small Media --- */
        .truthscope-result-compact {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 9997; /* Below button, above media */
            pointer-events: none; /* Allow clicks through */
            opacity: 0.4; /* Semi-transparent */
            border-radius: 3px; /* Match button */
            box-sizing: border-box;
            border: 2px solid transparent; /* Base border */
        }
        .truthscope-result-compact.is-authentic {
            background-color: rgba(0, 255, 0, 0.3); /* Green tint */
            border-color: rgba(0, 128, 0, 0.7);
        }
        .truthscope-result-compact.is-manipulated {
            background-color: rgba(255, 0, 0, 0.3); /* Red tint */
            border-color: rgba(139, 0, 0, 0.7);
        }
        .truthscope-result-compact.is-error {
            background-color: rgba(255, 165, 0, 0.3); /* Orange tint */
            border-color: rgba(204, 132, 0, 0.7);
        }
        .truthscope-result-compact.is-unknown {
            background-color: rgba(128, 128, 128, 0.3); /* Gray tint */
            border-color: rgba(80, 80, 80, 0.7);
        }
        /* --- End Compact Result Overlay --- */

        /* --- Updated Style for False Warning Header --- */
        .truthscope-false-warning-header {
            position: fixed; /* Or sticky */
            top: 0;
            left: 0;
            width: 100%;
            background-color: #d9534f; /* Red color */
            color: white;
            /* Adjust padding: top right bottom left. Added extra right padding */
            padding: 10px 30px 10px 15px; 
            text-align: center;
            font-size: 16px;
            font-weight: bold;
            z-index: 10000; /* Ensure it's on top */
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            border-bottom: 1px solid #a94442;
            display: flex; /* Use flexbox */
            justify-content: space-between; /* Space out items */
            align-items: center; /* Center items vertically */
            box-sizing: border-box; /* Include padding in width calculation */
        }
        .truthscope-header-content {
            flex-grow: 1; /* Allow content to take up space */
            text-align: center; /* Center the text */
            margin: 0 10px; /* Add some margin */
        }
        /* Style for the TruthScope brand text */
        .truthscope-brand-text {
            color: #e6e6fa; /* Lavender color */
            margin-right: 8px; /* Space between brand and message */
            font-weight: bold;
        }
        /* Style for action buttons container */
        .truthscope-header-actions {
            display: flex;
            align-items: center;
            gap: 10px; /* Space between buttons */
        }
        /* Style for generic header buttons */
        .truthscope-header-btn {
            background: none;
            border: none;
            color: white;
            font-size: 18px; /* Adjust size */
            font-weight: bold;
            cursor: pointer;
            padding: 0 5px;
            line-height: 1;
        }
        .truthscope-header-btn:hover {
            color: #eee;
        }
        /* Specific style for close button */
        .truthscope-header-close-btn {
             font-size: 22px; /* Make 'X' slightly larger */
        }
        /* Specific style for side panel button (using a simple icon/text) */
        .truthscope-header-sidepanel-btn {
             /* Add specific styles if needed, e.g., icon */
        }
        /* --- End Updated Style --- */
    `;
    document.head.appendChild(style);
}

// Function to add the false warning header
function addFalseWarningHeader(message) {
    // Check if header already exists
    if (document.getElementById('truthscope-false-header')) {
        return;
    }

    const headerDiv = document.createElement('div');
    headerDiv.id = 'truthscope-false-header';
    headerDiv.className = 'truthscope-false-warning-header';

    // Container for the main text content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'truthscope-header-content';

    // Create span for TruthScope brand
    const brandSpan = document.createElement('span');
    brandSpan.className = 'truthscope-brand-text';
    brandSpan.textContent = 'TruthScope:';

    // Create span for the main message
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message || "Warning: This article may contain false or misleading information according to our analysis.";

    // Append brand and message to content div
    contentDiv.appendChild(brandSpan);
    contentDiv.appendChild(messageSpan);

    // Container for action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'truthscope-header-actions';

    // --- Side Panel Button (Conditional) ---
    // Check if the Side Panel API is available before creating the button
    if (chrome.sidePanel && chrome.sidePanel.open) {
        const sidePanelButton = document.createElement('button');
        sidePanelButton.className = 'truthscope-header-btn truthscope-header-sidepanel-btn';
        sidePanelButton.innerHTML = '📊'; // Simple chart emoji as icon
        sidePanelButton.setAttribute('aria-label', 'Open analysis details');
        sidePanelButton.title = 'Open analysis details'; // Tooltip

        sidePanelButton.addEventListener('click', async () => {
            console.log("Attempting to open side panel...");
            try {
                // API existence already checked, but double-check just in case
                if (chrome.sidePanel && chrome.sidePanel.open) {
                    const currentWindow = await new Promise(resolve => chrome.windows.getCurrent({}, resolve));
                    if (currentWindow?.id) {
                        await chrome.sidePanel.open({ windowId: currentWindow.id });
                        console.log("Side panel open command issued for window:", currentWindow.id);
                    } else {
                        console.error("Could not get current window ID.");
                        // Consider a less intrusive notification than alert
                        // e.g., briefly changing button appearance or logging
                    }
                } else {
                    console.error("Side Panel API became unavailable after check.");
                    // Disable button or provide feedback
                    sidePanelButton.disabled = true; 
                    sidePanelButton.title = 'Side Panel unavailable';
                }
            } catch (error) {
                console.error("Error opening side panel:", error);
                // Consider less intrusive notification
            }
        });
        actionsDiv.appendChild(sidePanelButton); // Add button only if API exists
    } else {
        console.log("Side Panel API not available, side panel button not added.");
    }
    // --- End Side Panel Button ---

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.className = 'truthscope-header-btn truthscope-header-close-btn';
    closeButton.innerHTML = '&times;'; // Use HTML entity for 'X'
    closeButton.setAttribute('aria-label', 'Close warning');
    closeButton.title = 'Close warning'; // Tooltip

    closeButton.addEventListener('click', () => {
        headerDiv.remove();
    });

    // Append buttons to actions div
    actionsDiv.appendChild(closeButton);

    // Append content and actions to header
    // Order: Content first, then actions for space-between layout
    headerDiv.appendChild(contentDiv);
    headerDiv.appendChild(actionsDiv);


    document.body.prepend(headerDiv);
}

// Store analysis results temporarily and map IDs to elements/buttons
const analysisResults = {}; // Key: mediaId, Value: resultText (Consider removing if not used elsewhere)
const mediaDataMap = {}; // Key: mediaId, Value: { button: ButtonElement, element: MediaElement }

// Function to inject analysis button
let mediaCounter = 0;
function injectAnalysisButton(mediaElement) {
    const mediaType = mediaElement.tagName.toLowerCase(); // 'img', 'video', 'audio', 'iframe'
    let mediaSrc = mediaElement.currentSrc || mediaElement.src; // Prefer currentSrc
    let isYouTubeEmbed = false;

    // --- Source Extraction Logic ---
    if (mediaType === 'video' || mediaType === 'audio') {
        if (!mediaSrc) {
            const sourceElement = mediaElement.querySelector('source[src]');
            if (sourceElement) {
                mediaSrc = sourceElement.src;
            }
        }
    } else if (mediaType === 'iframe') {
        // Specifically handle YouTube embeds
        if (mediaSrc && (mediaSrc.includes('youtube.com/embed/') || mediaSrc.includes('youtube-nocookie.com/embed/'))) {
            isYouTubeEmbed = true;
        } else {
            return; // Skip non-YouTube iframes
        }
    }
    // --- End Source Extraction ---

    // Final check for a valid, absolute URL (basic check)
    if (!mediaSrc || typeof mediaSrc !== 'string' || (!mediaSrc.startsWith('http') && !isYouTubeEmbed)) {
        return; // Skip elements without a valid absolute source URL
    }

    // --- Filtering based on size (more flexible) ---
    if (mediaType === 'img') {
        if (mediaElement.offsetWidth === 0 && mediaElement.offsetHeight === 0) {
            mediaElement.onload = () => {
                if (mediaElement.naturalWidth > 50 && mediaElement.naturalHeight > 50) {
                    if (!mediaElement.dataset.truthscopeId) {
                         injectAnalysisButton(mediaElement);
                    }
                }
            };
            if (mediaElement.complete && (mediaElement.naturalWidth <= 50 || mediaElement.naturalHeight <= 50)) {
                 return;
            }
            if (!mediaElement.complete) {
                return;
            }
        } else if (mediaElement.offsetWidth < 50 || mediaElement.offsetHeight < 50) {
            return;
        }
    }
    // --- End Filtering ---

    // Check if button already exists for this element
    if (mediaElement.dataset.truthscopeId && mediaDataMap[mediaElement.dataset.truthscopeId]) {
        return; // Already processed
    }

    const mediaId = `truthscope-media-${mediaCounter++}`;
    mediaElement.dataset.truthscopeId = mediaId;

    const button = document.createElement('button');
    button.textContent = 'Analyze';
    button.classList.add('truthscope-analyze-button');
    button.dataset.mediaId = mediaId; // Link button to media element

    button.addEventListener('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();
        const analysisType = isYouTubeEmbed ? 'video' : mediaType;
        console.log(`Analyze button clicked for ${analysisType} (${mediaType} element): ${mediaSrc}`);
        button.textContent = 'Analyzing...';
        button.disabled = true;

        try {
            await ensureBackgroundScriptReady();
            await safeSendMessage({
                action: "processMediaItem",
                data: {
                    mediaUrl: mediaSrc,
                    mediaType: analysisType,
                    mediaId: mediaId
                }
            });
        } catch (error) {
            console.error('Error sending media analysis request:', error);
            displayAnalysisResult(mediaId, { status: 'error', error: error.message || 'Unknown error', mediaType: analysisType });
        }
    });

    mediaElement.parentElement.appendChild(button);
    mediaDataMap[mediaId] = { button: button, element: mediaElement }; // Store button and element reference
}

// Function to display analysis result
function displayAnalysisResult(mediaId, analysisData) {
    const mediaData = mediaDataMap[mediaId];
    if (!mediaData || !mediaData.button || !mediaData.element) {
        console.error(`Button or media element not found for mediaId: ${mediaId}`);
        // Attempt to find button by dataset just in case map failed
        const fallbackButton = document.querySelector(`.truthscope-analyze-button[data-media-id="${mediaId}"]`);
        if (fallbackButton) {
            fallbackButton.textContent = 'Error';
            fallbackButton.disabled = false;
        }
        return;
    }

    const button = mediaData.button;
    const mediaElement = mediaData.element;
    const container = button.parentElement; // Assume button is direct child for positioning result

    if (!container) {
        console.error(`Button's parentElement is null for mediaId: ${mediaId}. Cannot display result.`);
        button.textContent = 'Analyze';
        button.disabled = false;
        return;
    }

    // Remove existing result if any
    const existingResult = container.querySelector(`.truthscope-analysis-result[data-media-id="${mediaId}"], .truthscope-result-compact[data-media-id="${mediaId}"]`);
    if (existingResult) {
        existingResult.remove();
    }

    const resultDiv = document.createElement('div');
    resultDiv.dataset.mediaId = mediaId;

    // --- Size Check for Compact View ---
    const useCompactView = mediaElement.offsetWidth < 100 || mediaElement.offsetHeight < 100;
    let resultStatusClass = 'is-unknown'; // Default status
    let isLikelyAI = false;

    // Determine status based on analysisData
    if (analysisData.status === 'error') {
        resultStatusClass = 'is-error';
    } else if (analysisData.status === 'success') {
        const mediaType = analysisData.mediaType?.toLowerCase();
        if (mediaType === 'img' || mediaType === 'image') {
            const confidence = analysisData.manipulation_confidence;
            if (confidence !== null && confidence !== undefined) {
                 isLikelyAI = confidence >= 0.5;
                 resultStatusClass = isLikelyAI ? 'is-manipulated' : 'is-authentic';
            } else {
                 resultStatusClass = 'is-unknown'; // Confidence missing
            }
        } else if (mediaType === 'video' || mediaType === 'audio') {
            // For video/audio, we might need a different logic based on summary
            // For now, let's assume summary implies authenticity unless error
            // This needs refinement based on actual backend output for video/audio
            resultStatusClass = 'is-authentic'; // Placeholder
            if (!analysisData.summary) {
                 resultStatusClass = 'is-unknown';
            }
            // Example: if summary contains "likely deepfake", set is-manipulated
            // if (analysisData.summary && analysisData.summary.toLowerCase().includes('deepfake')) {
            //     resultStatusClass = 'is-manipulated';
            // }
        } else {
             resultStatusClass = 'is-unknown'; // Unknown media type
        }
    } else {
        // Handle cases where status might be missing or different
        resultStatusClass = 'is-unknown';
    }

    if (useCompactView) {
        resultDiv.classList.add('truthscope-result-compact', resultStatusClass);
        // No text content for compact view
    } else {
        // --- Standard Text Result Logic ---
        resultDiv.classList.add('truthscope-analysis-result');
        let resultText = "Analysis Result:";

        if (analysisData.status === 'error' && analysisData.error) {
            resultText = `Error: ${analysisData.error}`;
        } else if (analysisData.status === 'error' && analysisData.summary) {
            resultText = `Analysis Failed: ${analysisData.summary}`;
        } else if (analysisData.status === 'success') {
            const mediaType = analysisData.mediaType?.toLowerCase();

            if (mediaType === 'img' || mediaType === 'image') {
                const confidence = analysisData.manipulation_confidence;
                const aiLikelihoodPercent = confidence !== null && confidence !== undefined
                                          ? (confidence * 100).toFixed(1) + '%'
                                          : 'N/A';

                const manipulationStatus = resultStatusClass === 'is-manipulated' ? 'Likely AI/Manipulated' : (resultStatusClass === 'is-authentic' ? 'Likely Authentic' : 'Status Unknown');

                resultText = `${manipulationStatus} (AI Likelihood: ${aiLikelihoodPercent})`;

                if (analysisData.parsed_text) {
                    resultText += ` | Text: "${analysisData.parsed_text.substring(0, 30)}..."`;
                } else if (analysisData.ocr_error) {
                    resultText += ` | OCR Error: ${analysisData.ocr_error}`;
                }
            } else if (mediaType === 'video' || mediaType === 'audio') {
                resultText = analysisData.summary || "Analysis result unavailable.";
            } else {
                resultText = analysisData.summary || "Analysis complete, result format unclear.";
            }

        } else {
            resultText = analysisData.summary || "Analysis complete, but result format unclear.";
        }
        resultDiv.textContent = resultText;
        // --- End Standard Text Result Logic ---
    }

    // Append result to the container
    container.appendChild(resultDiv);

    // Reset button state
    button.textContent = 'Analyze';
    button.disabled = false;
}

// Function to find and add buttons to media elements
function addAnalysisButtonsToMedia() {
    const mediaElements = document.querySelectorAll(
        'img:not(.truthscope-ui-element):not([data-truthscope-id]), ' +
        'video:not(.truthscope-ui-element):not([data-truthscope-id]), ' +
        'audio:not(.truthscope-ui-element):not([data-truthscope-id]), ' +
        'iframe[src*="youtube.com/embed/"]:not(.truthscope-ui-element):not([data-truthscope-id]), ' +
        'iframe[src*="youtube-nocookie.com/embed/"]:not(.truthscope-ui-element):not([data-truthscope-id])'
    );
    mediaElements.forEach(el => {
        injectAnalysisButton(el);
    });
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

        await Promise.all([
            sendTextData(url, content),
        ]);

        addAnalysisButtonsToMedia();

        const observer = new MutationObserver((mutationsList) => {
            window.requestAnimationFrame(() => {
                for(const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const tagName = node.tagName;
                                let isRelevantMedia = false;

                                if (['IMG', 'VIDEO', 'AUDIO'].includes(tagName) && !node.dataset.truthscopeId) {
                                    isRelevantMedia = true;
                                } else if (tagName === 'IFRAME' && node.src && (node.src.includes('youtube.com/embed/') || node.src.includes('youtube-nocookie.com/embed/')) && !node.dataset.truthscopeId) {
                                    isRelevantMedia = true;
                                }

                                if (isRelevantMedia) {
                                    injectAnalysisButton(node);
                                }

                                if (node.hasChildNodes()) {
                                    node.querySelectorAll(
                                        'img:not([data-truthscope-id]), ' +
                                        'video:not([data-truthscope-id]), ' +
                                        'audio:not([data-truthscope-id]), ' +
                                        'iframe[src*="youtube.com/embed/"]:not([data-truthscope-id]), ' +
                                        'iframe[src*="youtube-nocookie.com/embed/"]:not([data-truthscope-id])'
                                    ).forEach(el => {
                                        injectAnalysisButton(el);
                                    });
                                }
                            }
                        });
                    }
                }
            });
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
  let isResponseAsync = false; // Flag to indicate if sendResponse will be called asynchronously
  try {
    console.log("Received message:", message);

    if (message.action === "getSelectedText") {
      const selectedText = window.getSelection().toString().trim();
      sendResponse({ text: selectedText });
      // Not async, sendResponse called directly
    }
    else if (message.action === "applyHighlights") {
        if (message.highlights && Array.isArray(message.highlights)) {
            applyHighlights(message.highlights);
            sendResponse({ status: "highlights applied" });
        } else {
            console.error("Invalid highlight data received:", message.highlights);
            sendResponse({ status: "error", error: "Invalid highlight data" });
        }
        // Not async
    }
    // --- Handle Media Analysis Result --- 
    else if (message.action === "displayMediaAnalysis") {
        console.log("[Content Script] Received displayMediaAnalysis message:", message);
        const { mediaId, ...analysisData } = message.data; 
        if (mediaId) {
            console.log(`[Content Script] Displaying analysis data for ${mediaId} (Type: ${analysisData.mediaType}):`, analysisData);
            displayAnalysisResult(mediaId, analysisData); 
            sendResponse({ status: "result processed" });
        } else {
            console.error("[Content Script] Invalid media analysis result data (missing mediaId):", message.data);
            sendResponse({ status: "error", error: "Invalid result data (missing mediaId)" });
        }
        // Not async
    }
    // --- End Handle Media Analysis Result ---

    // --- Handle Text Analysis Completion --- 
    else if (message.action === "analysisComplete") {
        console.log("Text analysis complete:", message.result);
        if (message.result && message.result.highlights && Array.isArray(message.result.highlights)) {
            applyHighlights(message.result.highlights);
        }
        if (message.result && message.result.label === "LABEL_1") { 
             addFalseWarningHeader(); 
        }
        sendResponse({ status: "analysis processed" });
        // Not async
    }
    // --- End Text Analysis Handling ---

    else if (message.action === "analysisError") {
        console.error("Received analysis error from background script:", message.error);
        sendResponse({ status: "error processed" });
        // Not async
    }
    else {
        // Handle unknown actions or cases where no response is needed
        // console.log("Unknown message action or no response needed:", message.action);
        // No sendResponse call needed here, so return false or undefined
        return false; 
    }

    // If we reached here, sendResponse was called synchronously
    return false; // Indicate synchronous response

  } catch (error) {
    console.error('Error handling message:', error);
    // Attempt to send error response only if sendResponse hasn't been called
    // and the connection is still open.
    try {
        // Check if the port is still open before sending
        // This check itself is async, so we can't reliably use sendResponse here
        // for the original message after this check completes.
        // Best practice: Call sendResponse synchronously if possible.
        // If an error occurs *before* any async operation starts in the handler,
        // we can call sendResponse here.
        if (!isResponseAsync) { // Only send if no async operation started
             sendResponse({ status: "error", error: error.message });
             return false; // Indicate synchronous response
        }
        // If an async operation already started (isResponseAsync is true),
        // it's too late to reliably call sendResponse for the original message here.
        // The original handler should have already returned true.
        console.warn("Cannot send error response asynchronously in catch block after async operation started.");

    } catch (e) {
        console.error("Failed during error handling:", e);
    }
    // Return true ONLY if we previously indicated an asynchronous response
    // and couldn't send a response synchronously in the catch block.
    return isResponseAsync;
  }
});

