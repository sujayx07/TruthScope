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

// Function to safely store data
async function safeStorageSet(data) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Keep track of last selection to avoid duplicate analysis
let lastSelection = '';
let isAnalyzing = false;

// Function to handle text selection
function handleSelection() {
  const selection = window.getSelection().toString().trim();
  
  if (selection && selection !== lastSelection && selection.split(/\s+/).length > 3) {
    console.log("📝 New text selection detected:", selection);
    lastSelection = selection;
  }
}

// Listen for selection events
document.addEventListener('mouseup', handleSelection);
document.addEventListener('keyup', handleSelection);

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

// Function to analyze content
async function analyzeContent(content) {
  if (isAnalyzing) {
    console.log("Analysis already in progress, skipping...");
    return;
  }

  isAnalyzing = true;
  try {
    console.log("Analyzing content:", content.substring(0, 100) + "...");
    await ensureBackgroundScriptReady();
    
    const response = await safeSendMessage({
      action: "analyzeText",
      data: content
    });

    await safeStorageSet({
      lastAnalysis: {
        ...response,
        text: content,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }
    });

    console.log("Analysis completed and stored successfully");
    return response;
  } catch (error) {
    console.error('Error analyzing content:', error);
    throw error;
  } finally {
    isAnalyzing = false;
  }
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
    if (!isArticlePage()) return;

    if (document.readyState === 'complete') {
      const content = extractArticleContent();
      if (content && content.length > 100) {
        await analyzeContent(content);
      }
    } else {
      window.addEventListener('load', async () => {
        const content = extractArticleContent();
        if (content && content.length > 100) {
          await analyzeContent(content);
        }
      });
    }
  } catch (error) {
    console.error('Error in initialization:', error);
  }
}

// Initialize
init();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log("Received message:", message);
    
    if (message.action === "getSelectedText") {
      const selectedText = window.getSelection().toString().trim();
      sendResponse({ text: selectedText });
      return true;
    }
    
    if (message.action === "analyzeContent") {
      console.log("Received analyzeContent request");
      const content = extractArticleContent();
      if (content && content.length > 100) {
        analyzeContent(content)
          .then(() => sendResponse({ status: "analyzing" }))
          .catch(error => sendResponse({ status: "error", error: error.message }));
        return true;
      } else {
        sendResponse({ status: "no_content" });
        return true;
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ status: "error", error: error.message });
    return true;
  }
});
