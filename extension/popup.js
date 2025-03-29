// Function to check if background script is ready
async function ensureBackgroundScriptReady() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("⏳ Background script not ready, retrying...");
        setTimeout(() => ensureBackgroundScriptReady().then(resolve), 100);
      } else {
        console.log("✅ Background script ready");
        resolve();
      }
    });
  });
}

// Function to safely send message with retry
async function sendMessageWithRetry(message, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    function trySend() {
      attempts++;
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.log(`⚠️ Attempt ${attempts} failed:`, chrome.runtime.lastError);
          if (attempts < maxRetries) {
            setTimeout(trySend, 1000); // Wait 1 second before retry
          } else {
            reject(new Error(`Failed after ${maxRetries} attempts: ${chrome.runtime.lastError.message}`));
          }
        } else {
          resolve(response);
        }
      });
    }
    
    trySend();
  });
}

// Function to show loading state
function showLoading(element) {
  element.innerHTML = '<div class="loading">Processing...</div>';
}

// Function to show error
function showError(element, message) {
  element.innerHTML = `<div class="error">${message}</div>`;
}

document.addEventListener('DOMContentLoaded', function() {
  console.log("🚀 Popup initialized");
  
  const analyzeBtn = document.getElementById('analyzeBtn');
  const selectedTextDiv = document.getElementById('selectedText');
  const analysisResultDiv = document.getElementById('analysisResult');
  const newsResultsDiv = document.getElementById('newsResults');

  // Get the active tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (chrome.runtime.lastError) {
      console.error("❌ Error getting active tab:", chrome.runtime.lastError);
      selectedTextDiv.textContent = "Error: Please refresh the page and try again.";
      return;
    }

    console.log("📑 Getting selected text from active tab");
    // Send message to content script to get selected text
    chrome.tabs.sendMessage(tabs[0].id, {action: "getSelectedText"}, function(response) {
      if (chrome.runtime.lastError) {
        console.error("❌ Error getting selected text:", chrome.runtime.lastError);
        selectedTextDiv.textContent = "Error getting selected text. Please refresh the page and try again.";
        return;
      }
      
      if (response && response.text) {
        console.log("📝 Selected text:", response.text);
        selectedTextDiv.textContent = response.text;
      } else {
        console.log("⚠️ No text selected");
        selectedTextDiv.textContent = "No text selected. Please select some text on the page.";
        analyzeBtn.disabled = true;
      }
    });
  });

  // Listen for analysis results from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "analysisResult") {
      console.log("📊 Received analysis result from content script:", message.result);
      displayAnalysisResult(message.result);
    }
  });

  analyzeBtn.addEventListener('click', async function() {
    console.log("🔍 Analysis button clicked");
    const selectedText = selectedTextDiv.textContent;
    
    if (selectedText === "No text selected. Please select some text on the page.") {
      console.log("⚠️ No text selected for analysis");
      showError(analysisResultDiv, "Please select some text to analyze.");
      return;
    }

    // Show loading state
    showLoading(analysisResultDiv);
    showLoading(newsResultsDiv);
    analyzeBtn.disabled = true;

    try {
      // Ensure background script is ready
      await ensureBackgroundScriptReady();

      // Send text for fake news analysis with retry
      const analysisResponse = await sendMessageWithRetry({
        action: "analyzeText",
        data: selectedText
      });
      
      console.log("📊 Received analysis response:", analysisResponse);
      
      if (analysisResponse.error) {
        console.error("❌ Analysis error:", analysisResponse.error);
        showError(analysisResultDiv, `Error: ${analysisResponse.error}`);
        return;
      }

      // Display analysis result
      displayAnalysisResult(analysisResponse);

      // Fetch related news with retry
      console.log("📰 Fetching related news for:", selectedText);
      const newsResponse = await sendMessageWithRetry({
        action: "getNews",
        data: selectedText
      });
      
      console.log("📋 Received news response:", newsResponse);
      
      if (newsResponse.error) {
        console.error("❌ News API error:", newsResponse.error);
        showError(newsResultsDiv, `Error fetching news: ${newsResponse.error}`);
        return;
      }

      if (!newsResponse.news || newsResponse.news.length === 0) {
        console.log("⚠️ No news articles found");
        newsResultsDiv.innerHTML = "No related news articles found.";
        return;
      }

      // Display news results
      displayNewsResults(newsResponse.news);
    } catch (error) {
      console.error("❌ Error in analysis process:", error);
      showError(analysisResultDiv, `Error: ${error.message}`);
    } finally {
      analyzeBtn.disabled = false;
    }
  });

  // Function to display analysis result
  function displayAnalysisResult(result) {
    const isFakeNews = result.label === "LABEL_1";
    const confidence = (result.score * 100).toFixed(1);
    
    let analysisHTML = `
      <div class="status-badge ${isFakeNews ? 'fake' : 'real'}">
        ${isFakeNews ? '⚠️ Potential Fake News' : '✅ Credible Content'}
      </div>
      <div class="confidence">Confidence: ${confidence}%</div>
    `;

    // Add fact-check results if available
    if (result.fact_check) {
      console.log("🔍 Fact-check results:", result.fact_check);
      if (typeof result.fact_check === 'string') {
        analysisHTML += `<div class="fact-check">${result.fact_check}</div>`;
      } else if (Array.isArray(result.fact_check)) {
        analysisHTML += '<div class="fact-check">';
        result.fact_check.forEach(source => {
          analysisHTML += `
            <div style="margin-bottom: 8px;">
              <strong>${source.source}</strong><br>
              ${source.title}
            </div>
          `;
        });
        analysisHTML += '</div>';
      }
    }

    analysisResultDiv.innerHTML = analysisHTML;
  }

  // Function to display news results
  function displayNewsResults(news) {
    let newsHTML = '';
    news.forEach((article, index) => {
      console.log(`📄 Processing news article ${index + 1}:`, article.title);
      newsHTML += `
        <div class="news-item">
          <div class="news-title">
            <a href="${article.url}" target="_blank">${article.title}</a>
          </div>
          <div class="news-source">Source: ${article.source}</div>
          ${article.fact_check ? `
            <div class="news-fact-check">
              ${typeof article.fact_check === 'string' 
                ? article.fact_check 
                : article.fact_check.map(source => `
                  <div style="margin-bottom: 4px;">
                    <strong>${source.source}</strong><br>
                    ${source.title}
                  </div>
                `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    });
    newsResultsDiv.innerHTML = newsHTML;
  }
});
