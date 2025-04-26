/**
 * @fileoverview Sidepanel script for TruthScope extension.
 * Handles theme switching, fetching analysis data, and displaying results.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Element References ---
  const statusBadge = document.getElementById('statusBadge');
  const confidenceDiv = document.getElementById('confidence');
  const factCheckResultsContainer = document.getElementById('factCheckResults');
  const newsResultsContainer = document.getElementById('newsResults');
  const themeToggleButton = document.getElementById('themeToggleButton');

  // Check if essential elements exist
  if (!statusBadge || !confidenceDiv || !factCheckResultsContainer || !newsResultsContainer || !themeToggleButton) {
    console.error("TruthScope Sidepanel Error: One or more essential UI elements are missing.");
    document.body.innerHTML = '<div class="p-4 text-red-600">Error: Sidepanel UI failed to load correctly. Please try reloading the extension.</div>';
    return;
  }

  // --- Theme Handling ---
  const THEMES = ['light', 'dark', 'system'];
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  /**
   * Gets the stored theme preference from chrome.storage.local.
   * @returns {Promise<string>} The stored theme ('light', 'dark', or 'system').
   */
  async function getStoredTheme() {
    try {
      const result = await chrome.storage.local.get(['theme']);
      return THEMES.includes(result.theme) ? result.theme : 'system';
    } catch (error) {
      console.error("Error getting theme preference:", error);
      return 'system'; // Default to system on error
    }
  }

  /**
   * Applies the theme to the UI based on the stored preference and system settings.
   * Updates the HTML class and the toggle button title.
   * @param {string} storedPreference - The user's selected preference ('light', 'dark', or 'system').
   */
  function applyThemeUI(storedPreference) {
    const htmlElement = document.documentElement;
    htmlElement.classList.remove('light', 'dark');

    // Determine the actual theme to apply (light or dark)
    let themeToApply = storedPreference;
    if (storedPreference === 'system') {
      themeToApply = prefersDark.matches ? 'dark' : 'light';
    }
    htmlElement.classList.add(themeToApply); // Add 'light' or 'dark' class

    // Update toggle button title
    const currentIndex = THEMES.indexOf(storedPreference);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    const nextTheme = THEMES[nextIndex];
    themeToggleButton.title = `Change theme (currently ${storedPreference}, next: ${nextTheme})`;
  }

  /**
   * Cycles to the next theme, saves it to storage, and updates the UI.
   */
  async function cycleTheme() {
    try {
        const currentStoredTheme = await getStoredTheme();
        const currentIndex = THEMES.indexOf(currentStoredTheme);
        const nextTheme = THEMES[(currentIndex + 1) % THEMES.length];
        // Save the *next* theme preference to storage
        await chrome.storage.local.set({ theme: nextTheme });
        // Apply the *next* theme preference to the UI immediately
        applyThemeUI(nextTheme);
    } catch (error) {
        console.error("Error cycling theme:", error);
    }
  }

  /**
   * Initializes the theme on load and sets up listeners.
   */
  async function initializeTheme() {
    const initialTheme = await getStoredTheme();
    applyThemeUI(initialTheme);

    themeToggleButton.addEventListener('click', cycleTheme);

    // Listen for system theme changes
    prefersDark.addEventListener('change', async () => {
      const currentStoredTheme = await getStoredTheme();
      if (currentStoredTheme === 'system') {
        applyThemeUI('system'); // Re-apply based on new system preference
      }
    });

    // Listen for changes from storage (e.g., popup changing the theme)
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.theme) {
        const newThemePreference = changes.theme.newValue || 'system';
        applyThemeUI(newThemePreference);
      }
    });
  }

  // --- Data Display ---

  /**
   * Creates HTML for a loading placeholder.
   * @param {string} text - The loading message.
   * @returns {string} HTML string for the placeholder.
   */
  function createLoadingPlaceholderHTML(text) {
    return `
      <div class="loading-placeholder">
          <div class="spinner"></div>
          <span>${text}</span>
      </div>
    `;
  }

  /**
   * Creates HTML for a single fact-check source item.
   * @param {object} source - The source data object.
   * @returns {string} HTML string for the source item.
   */
  function createSourceItemHTML(source) {
    const title = source.title || 'Untitled Source';
    const url = source.url;
    const snippet = source.snippet;
    const sourceName = source.source || 'Unknown';
    const date = source.date;

    return `
      <div class="source-item">
        <div class="source-title">
          ${url ? `<a href="${url}" target="_blank" class="source-link">${title}</a>` : title}
        </div>
        ${snippet ? `<p class="source-snippet">${snippet}</p>` : ''}
        <div class="source-meta">Source: ${sourceName}${date ? ` - ${date}` : ''}</div>
      </div>
    `;
  }

  /**
   * Creates HTML for a single related news item.
   * @param {object} article - The article data object.
   * @returns {string} HTML string for the news item.
   */
  function createNewsItemHTML(article) {
    const title = article.title || 'Untitled Article';
    const url = article.url;
    const snippet = article.snippet;
    const sourceName = article.source || 'Unknown';
    const date = article.date;

    return `
      <div class="news-item">
        <div class="news-title">
          ${url ? `<a href="${url}" target="_blank" class="news-link">${title}</a>` : title}
        </div>
        ${snippet ? `<p class="news-snippet">${snippet}</p>` : ''}
        <div class="news-meta">Source: ${sourceName}${date ? ` - ${date}` : ''}</div>
      </div>
    `;
  }

  /**
   * Renders the fact-check results in the designated container.
   * @param {object[]|object|string|null} factCheckData - The data received for fact checks.
   */
  function renderFactCheckResults(factCheckData) {
    let contentHTML;
    if (typeof factCheckData === 'string' && !factCheckData.startsWith('{')) {
      // Handle plain string error messages from backend
      contentHTML = `<div class="source-item text-red-500">Error: ${factCheckData}</div>`;
    } else if (Array.isArray(factCheckData) && factCheckData.length > 0) {
      contentHTML = factCheckData.map(createSourceItemHTML).join('');
    } else if (typeof factCheckData === 'object' && factCheckData !== null && factCheckData.error) {
      // Handle structured error object
      contentHTML = `<div class="source-item text-red-500">Error fetching fact checks: ${factCheckData.error}</div>`;
    } else {
      // Handle empty array or other non-error, no-data cases
      contentHTML = '<div class="text-gray-500 p-4">No fact-check sources found for this content.</div>';
    }
    factCheckResultsContainer.innerHTML = contentHTML;
  }

  /**
   * Renders the related news results in the designated container.
   * @param {object[]|null} newsData - Array of news articles or null.
   */
  function renderNewsResults(newsData) {
    if (Array.isArray(newsData) && newsData.length > 0) {
      newsResultsContainer.innerHTML = newsData.map(createNewsItemHTML).join('');
    } else {
      // Handle empty array or null
      newsResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No related news articles found.</div>';
    }
  }

  /**
   * Updates the main status badge and confidence score display.
   * @param {object} result - The analysis result object.
   */
  function updateStatusDisplay(result) {
    const isFakeNews = result.label === "LABEL_1";
    const confidence = (result.score * 100).toFixed(1);

    statusBadge.textContent = isFakeNews ? "Potential Misinformation" : "Likely Credible";
    statusBadge.className = `status-badge ${isFakeNews ? 'fake' : 'real'}`;
    confidenceDiv.textContent = `Confidence Score: ${confidence}%`;
  }

  /**
   * Displays the full analysis result, including status, fact-checks, and triggers news fetch.
   * @param {object | null} result - The analysis result object from storage, or null if unavailable.
   */
  function displayAnalysisResult(result) {
    if (!result) {
      // Handle case where no analysis is available
      statusBadge.textContent = "Unavailable";
      statusBadge.className = "status-badge unknown";
      confidenceDiv.textContent = "Analysis could not be performed or is not available for this page.";
      factCheckResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No fact-check sources available.</div>';
      newsResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No related news available.</div>';
      return;
    }

    // Update status and confidence
    updateStatusDisplay(result);

    // Render fact-check results
    renderFactCheckResults(result.fact_check);

    // Fetch and render related news if text is available
    if (result.text) {
      fetchAndRenderRelatedNews(result.text);
    } else {
      newsResultsContainer.innerHTML = '<div class="text-gray-500 p-4">Cannot fetch news without analysis text.</div>';
    }
  }

  // --- Data Fetching ---

  /**
   * Fetches related news from the background script and renders them.
   * @param {string} text - The text to find related news for.
   */
  async function fetchAndRenderRelatedNews(text) {
    newsResultsContainer.innerHTML = createLoadingPlaceholderHTML('Loading related news...');
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getNews",
        data: text
      });

      if (response.error) {
        throw new Error(response.error);
      }
      renderNewsResults(response.news);

    } catch (error) {
      console.error("Error fetching or rendering news:", error);
      newsResultsContainer.innerHTML = `<div class="news-item text-red-500">Error loading related news: ${error.message}</div>`;
    }
  }

  // --- Initialization and Listeners ---

  /**
   * Loads the initial analysis data from storage.
   */
  async function loadInitialData() {
    try {
      const result = await chrome.storage.local.get(['lastAnalysis']);
      displayAnalysisResult(result.lastAnalysis || null);
    } catch (error) {
      console.error("Error loading initial analysis data:", error);
      displayAnalysisResult(null); // Show unavailable state on error
    }
  }

  /**
   * Sets up listener for analysis changes in storage.
   * (Theme listener is now part of initializeTheme)
   */
  function setupAnalysisListener() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.lastAnalysis) {
          displayAnalysisResult(changes.lastAnalysis.newValue || null);
      }
    });
  }

  // --- Main Execution ---
  initializeTheme(); // Sets up theme and its listeners
  loadInitialData();
  setupAnalysisListener(); // Separate listener for analysis data

});