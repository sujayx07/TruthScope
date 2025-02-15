document.getElementById("scan-button").addEventListener("click", async () => {
  try {
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
          document.getElementById("result").innerText = "Please highlight some text to analyze.";
          return;
        }

        // Send the highlighted text to the Flask backend
        const response = await fetch("http://127.0.0.1:5000/analyze-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: highlightedText }),
        });

        const result = await response.json();
        document.getElementById("result").innerText = result.geminiResult;
      }
    );
  } catch (error) {
    document.getElementById("result").innerText = `Error: ${error.message}`;
  }
});
