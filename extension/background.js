// Keep track of active connections
let activeConnections = new Set();

// Handle connection events
chrome.runtime.onConnect.addListener((port) => {
  activeConnections.add(port);
  port.onDisconnect.addListener(() => {
    activeConnections.delete(port);
  });
});

// Handle messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle ping messages for connection checking
  if (message.action === "ping") {
    sendResponse({ status: "ready" });
    return false;
  }

  // Handle text analysis requests
  if (message.action === "analyzeText") {
    console.log("Received text for analysis:", message.data);

    // Send text to backend for analysis
    fetch("http://127.0.0.1:5000/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message.data })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then(result => {
        console.log("Backend analysis result:", result);

        // Send response back to popup
        sendResponse(result);

        // Create notification based on the result
        const isFakeNews = result.label === "LABEL_1";
        const confidence = (result.score * 100).toFixed(2);
        
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon16.png",
          title: isFakeNews ? "⚠️ Potential Fake News Detected" : "✅ Real News",
          message: `Confidence: ${confidence}%${isFakeNews ? "\nCheck fact-check sources for details." : ""}`
        });
      })
      .catch(error => {
        console.error("Error during fetch:", error);
        sendResponse({ error: error.message });
        
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon16.png",
          title: "❌ Error",
          message: "Error analyzing text. Please check the backend."
        });
      });

    // Return true to indicate we will send a response asynchronously
    return true;
  }

  // Handle text selection messages from content script
  if (message.action === "textSelected") {
    console.log("Text selected in content script:", message.data);
    // You can add additional handling here if needed
    return false;
  }
});
