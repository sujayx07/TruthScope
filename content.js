(function() {
  // Get the user-highlighted text
  const selectedText = window.getSelection().toString();

  if (selectedText) {
    // Log the extracted selected text
    console.log("Extracted highlighted text:", selectedText);

    // Send selected text to the background script for analysis
    chrome.runtime.sendMessage({ action: "analyzeText", data: selectedText });
  } else {
    console.log("No text is highlighted.");
  }
})();
