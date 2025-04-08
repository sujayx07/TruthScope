document.addEventListener('DOMContentLoaded', function() {
  const statusBadge = document.getElementById('statusBadge');
  const confidenceDiv = document.getElementById('confidence');
  const factCheckResults = document.getElementById('factCheckResults');
  const newsResults = document.getElementById('newsResults');

  // Function to display analysis result
  function displayAnalysisResult(result) {
    if (!result) {
      statusBadge.textContent = "No analysis available";
      statusBadge.className = "status-badge unknown";
      return;
    }

    const isFakeNews = result.label === "LABEL_1";
    const confidence = (result.score * 100).toFixed(1);
    
    // Update status badge
    statusBadge.textContent = isFakeNews ? "Potential Fake News" : "Credible Content";
    statusBadge.className = `status-badge ${isFakeNews ? 'fake' : 'real'}`;
    
    // Update confidence
    confidenceDiv.textContent = `Confidence: ${confidence}%`;

    // Display fact-check results
    if (result.fact_check) {
      let factCheckHTML = '';
      if (typeof result.fact_check === 'string') {
        factCheckHTML = `<div class="bg-gray-50 p-4 rounded-lg">${result.fact_check}</div>`;
      } else if (Array.isArray(result.fact_check)) {
        result.fact_check.forEach(source => {
          factCheckHTML += `
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="font-semibold text-gray-800">${source.source}</div>
              <div class="text-gray-600 mt-1">${source.title}</div>
            </div>
          `;
        });
      }
      factCheckResults.innerHTML = factCheckHTML || "No fact-check sources available.";
    }

    // Fetch related news
    fetchRelatedNews(result.text);
  }

  // Function to fetch and display related news
  async function fetchRelatedNews(text) {
    try {
      newsResults.innerHTML = '<div class="flex items-center justify-center gap-2 text-gray-600"><div class="loading"></div>Loading related news...</div>';
      
      const response = await chrome.runtime.sendMessage({
        action: "getNews",
        data: text
      });
      
      if (response.error) {
        throw new Error(response.error);
      }

      if (!response.news || response.news.length === 0) {
        newsResults.innerHTML = '<div class="text-gray-500">No related news articles found.</div>';
        return;
      }

      let newsHTML = '';
      response.news.forEach(article => {
        newsHTML += `
          <div class="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <div class="font-semibold text-gray-800 mb-2">
              <a href="${article.url}" target="_blank" class="text-blue-600 hover:text-blue-800 hover:underline">${article.title}</a>
            </div>
            <div class="text-sm text-gray-500 mb-3">Source: ${article.source}</div>
            ${article.fact_check ? `
              <div class="bg-gray-50 p-3 rounded-lg text-sm">
                ${typeof article.fact_check === 'string' 
                  ? article.fact_check 
                  : article.fact_check.map(source => `
                    <div class="mb-2">
                      <div class="font-medium text-gray-800">${source.source}</div>
                      <div class="text-gray-600">${source.title}</div>
                    </div>
                  `).join('')}
              </div>
            ` : ''}
          </div>
        `;
      });
      newsResults.innerHTML = newsHTML;
    } catch (error) {
      console.error("Error fetching news:", error);
      newsResults.innerHTML = '<div class="text-red-500">Error loading related news.</div>';
    }
  }

  // Get the latest analysis result
  chrome.storage.local.get(['lastAnalysis'], function(result) {
    if (result.lastAnalysis) {
      displayAnalysisResult(result.lastAnalysis);
    }
  });

  // Listen for analysis updates
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.lastAnalysis) {
      displayAnalysisResult(changes.lastAnalysis.newValue);
    }
  });
}); 