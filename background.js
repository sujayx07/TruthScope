chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyzeText") {
    console.log("Received text for analysis:", message.data);

    // Send text to backend or local analysis
    fetch("http://127.0.0.1:5000/analyze-text", {
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

        if (result.isMisinformation) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon16.png", // Replace with your icon file
            title: "⚠️ Misinformation Detected",
            message: "Potential misinformation has been detected!"
          });
        } else {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon16.png", // Replace with your icon file
            title: "✅ No Misinformation",
            message: "No misinformation detected on this page."
          });
        }
      })
      .catch(error => {
        console.error("Error during fetch:", error);
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon16.png", // Replace with your icon file
          title: "❌ Error",
          message: "Error analyzing text. Please check the backend."
        });
      });
  }
});
