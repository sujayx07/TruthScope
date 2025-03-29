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

document.getElementById("scan-button").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  const loadingDiv = document.getElementById("loading");
  
  try {
    // Show loading indicator
    loadingDiv.style.display = "block";
    resultDiv.innerHTML = "";

    // Ensure background script is ready
    await ensureBackgroundScriptReady();

    // Get the user's highlighted text
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => window.getSelection().toString(),
      },
      async (selection) => {
        const highlightedText = selection[0].result;

        if (!highlightedText) {
          resultDiv.innerHTML = "Please highlight some text to analyze.";
          loadingDiv.style.display = "none";
          return;
        }

        // Send message to background script for analysis
        chrome.runtime.sendMessage(
          { action: "analyzeText", data: highlightedText },
          (response) => {
            if (chrome.runtime.lastError) {
              resultDiv.innerHTML = `Connection error: Please try again. If the problem persists, reload the extension.`;
              console.error("Runtime error:", chrome.runtime.lastError);
            } else if (response.error) {
              resultDiv.innerHTML = `Error: ${response.error}`;
            } else {
              // Format the result
              const confidence = (response.score * 100).toFixed(2);
              const label = response.label === "LABEL_1" ? "Fake News" : "Real News";
              const labelColor = response.label === "LABEL_1" ? "#dc3545" : "#28a745";
              
              let factCheckHtml = "";
              if (Array.isArray(response.fact_check)) {
                factCheckHtml = response.fact_check.map(source => 
                  `<div style="margin-top: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                    <strong>${source.title}</strong><br>
                    <small style="color: #6c757d;">Source: ${source.source}</small>
                  </div>`
                ).join("");
              } else {
                factCheckHtml = `<div style="margin-top: 10px; color: #6c757d;">${response.fact_check}</div>`;
              }

              resultDiv.innerHTML = `
                <div style="margin-bottom: 10px;">
                  <strong>Analysis Result:</strong> 
                  <span style="color: ${labelColor}">${label}</span>
                  <br>
                  <small>Confidence: ${confidence}%</small>
                </div>
                <div>
                  <strong>Fact Check Sources:</strong>
                  ${factCheckHtml}
                </div>
              `;
            }
            loadingDiv.style.display = "none";
          }
        );
      }
    );
  } catch (error) {
    resultDiv.innerHTML = `Error: ${error.message}`;
    loadingDiv.style.display = "none";
  }
});
