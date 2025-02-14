(function() {
    // Extract all visible text on the page
    const pageText = document.body.innerText || "";
  
    // Log the extracted text
    console.log("Extracted text from page:", pageText);
  
    // Send text to the background script for analysis
    chrome.runtime.sendMessage({ action: "analyzeText", data: pageText });
  })();
  