// Keep track of active connections and processing state
let activeConnections = new Set();
let isProcessing = false;

// Handle connection events
chrome.runtime.onConnect.addListener((port) => {
  activeConnections.add(port);
  
  // Handle keep-alive connections
  if (port.name === "keepAlive") {
    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        console.log('Keep-alive port disconnected');
      }
    });
  }
  
  port.onDisconnect.addListener(() => {
    activeConnections.delete(port);
  });
});

// Handle messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle ping messages for connection checking
  if (message.action === "ping") {
    sendResponse({ status: "ready" });
    return true;
  }

  // Handle text analysis requests
  if (message.action === "analyzeText" && !isProcessing) {
    console.log("📝 Received text for analysis:", message.data);
    isProcessing = true;

    // Limit input size and prepare request
    const text = message.data.slice(0, 1000);
    
    fetch("http://127.0.0.1:5000/check", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ text })
    })
      .then(async response => {
        console.log(" Analysis API Response Status:", response.status);
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`HTTP ${response.status}: ${error}`);
        }
        return response.json();
      })
      .then(result => {
        console.log(" Backend analysis result:", result);

        // Send response back to popup
        sendResponse(result);

        // Create notification with improved details
        const isFakeNews = result.label === "LABEL_1";
        const confidence = (result.score * 100).toFixed(1);
        const factCheckSource = result.fact_check?.[0]?.source || "No fact checks found";
        
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon16.png",
          title: isFakeNews ? "⚠️ Potential Fake News" : "✅ Credible Content",
          message: `Confidence: ${confidence}%`,
          contextMessage: factCheckSource
        });

        // Broadcast result to all tabs
        chrome.tabs.query({}, function(tabs) {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              action: "analysisResult",
              result
            }).catch(() => {
              // Ignore errors for inactive tabs
            });
          });
        });
      })
      .catch(error => {
        console.error("❌ Error during analysis:", error);
        sendResponse({ error: error.message });
        
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon16.png",
          title: "❌ Error",
          message: "Error analyzing text. Please check the backend."
        });
      })
      .finally(() => {
        isProcessing = false;
      });

    return true;
  }

  // Handle news API requests
  if (message.action === "getNews") {
    console.log("📰 Fetching news for query:", message.data);
    
    // Construct the URL with proper encoding and default category
    const url = `http://127.0.0.1:5000/news?query=${encodeURIComponent(message.data)}&category=general`;
    console.log("🔗 News API URL:", url);
    
    fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    })
      .then(async response => {
        console.log("📡 News API Response Status:", response.status);
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`HTTP ${response.status}: ${error}`);
        }
        return response.json();
      })
      .then(result => {
        console.log("📋 News API result:", result);
        if (!result.news || result.news.length === 0) {
          console.log("⚠️ No news articles found");
          sendResponse({ news: [] });
          return;
        }
        sendResponse(result);
      })
      .catch(error => {
        console.error("❌ Error fetching news:", error);
        sendResponse({ error: error.message });
      });

    return true;
  }

  // Handle text selection messages from content script
  if (message.action === "textSelected") {
    console.log("👆 Text selected in content script:", message.data);
    return false;
  }
});
