/**
 * @fileoverview Sidepanel script for TruthScope extension.
 * Handles theme switching, fetching analysis data, and displaying results.
 */

document.addEventListener('DOMContentLoaded', function() {
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
        htmlElement.classList.remove('light', 'dark', 'theme-preference-system'); // Remove all theme-related classes

        // Determine the actual theme to apply (light or dark)
        let themeToApply = storedPreference;
        if (storedPreference === 'system') {
            themeToApply = prefersDark.matches ? 'dark' : 'light';
            htmlElement.classList.add('theme-preference-system'); // Add class if preference is system
        }
        htmlElement.classList.add(themeToApply); // Add 'light' or 'dark' class for actual appearance

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
        const sourceName = source.source || 'Unknown';
        
        return `
            <div class="source-item">
                <div class="source-title">
                    ${url ? `<a href="${url}" target="_blank" class="source-link">${title}</a>` : title}
                </div>
                <div class="source-meta">Source: ${sourceName}</div>
            </div>
        `;
    }

    /**
     * Displays the full analysis result, including status, fact-checks, and media results.
     * @param {object | null} data - The analysis result object from background.js, or null if unavailable.
     */
    function displayResults(data) {
        factCheckResultsContainer.innerHTML = '';
        newsResultsContainer.innerHTML = '';

        if (!data || (!data.textResult && !data.mediaResult)) {
            // Handle case where no analysis is available
            statusBadge.textContent = "Unavailable";
            statusBadge.className = "status-badge unknown";
            confidenceDiv.textContent = "Analysis could not be performed or is not available for this page.";
            factCheckResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No fact-check sources available.</div>';
            newsResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No related news available.</div>';
            return;
        }

        // Display Text Analysis Result
        if (data.textResult) {
            if (data.textResult.error) {
                statusBadge.textContent = "Error";
                statusBadge.className = "status-badge unknown";
                confidenceDiv.textContent = `Error: ${data.textResult.error}`;
                factCheckResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No fact-check sources available due to error.</div>';
            } else if (data.textResult.label !== undefined) {
                const isFake = data.textResult.label === "LABEL_1"; // Assuming LABEL_1 is fake
                const confidence = (data.textResult.score * 100).toFixed(1);
                
                statusBadge.textContent = isFake ? "Potential Misinformation" : "Likely Credible";
                statusBadge.className = `status-badge ${isFake ? 'fake' : 'real'}`;
                confidenceDiv.textContent = `Confidence Score: ${confidence}%`;

                // Display fact-check results if available
                if (data.textResult.fact_check && Array.isArray(data.textResult.fact_check) && data.textResult.fact_check.length > 0) {
                    const factsHtml = data.textResult.fact_check.map(createSourceItemHTML).join('');
                    factCheckResultsContainer.innerHTML = factsHtml;
                } else {
                    factCheckResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No fact-check sources found for this content.</div>';
                }
            } else {
                statusBadge.textContent = "Unknown";
                statusBadge.className = "status-badge unknown";
                confidenceDiv.textContent = "Analysis result format unknown.";
            }
        } else {
            statusBadge.textContent = "Pending";
            statusBadge.className = "status-badge unknown";
            confidenceDiv.textContent = "Text analysis pending or failed.";
        }

        // Display Media Analysis Result
        if (data.mediaResult) {
            if (data.mediaResult.error) {
                newsResultsContainer.innerHTML = `<div class="text-red-500 p-4">Media Analysis Error: ${data.mediaResult.error}</div>`;
            } else {
                // Customize this based on your actual media result structure
                const mediaContent = `
                    <div class="card p-4">
                        <h3 class="text-lg font-semibold mb-2">Media Analysis</h3>
                        <pre class="whitespace-pre-wrap text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded">${JSON.stringify(data.mediaResult, null, 2)}</pre>
                    </div>
                `;
                newsResultsContainer.innerHTML = mediaContent;
            }
        } else {
            newsResultsContainer.innerHTML = '<div class="text-gray-500 p-4">Media analysis pending or not available.</div>';
        }
    }

    // Function to fetch and display results for the current tab
    function loadResultsForCurrentTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const currentTab = tabs[0];
            if (currentTab && currentTab.id) {
                statusBadge.textContent = "Loading...";
                statusBadge.className = "status-badge loading";
                confidenceDiv.textContent = "Fetching analysis results...";
                factCheckResultsContainer.innerHTML = createLoadingPlaceholderHTML('Loading fact check results...');
                newsResultsContainer.innerHTML = createLoadingPlaceholderHTML('Loading media analysis...');

                chrome.runtime.sendMessage(
                    { action: "getResultForTab", tabId: currentTab.id },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error("Error getting result:", chrome.runtime.lastError.message);
                            statusBadge.textContent = "Error";
                            statusBadge.className = "status-badge unknown";
                            confidenceDiv.textContent = "Error communicating with background script.";
                            factCheckResultsContainer.innerHTML = '<div class="text-red-500 p-4">Error retrieving results.</div>';
                            newsResultsContainer.innerHTML = '<div class="text-red-500 p-4">Error retrieving results.</div>';
                            return;
                        }

                        if (response && response.status === "found") {
                            console.log("Received data for sidepanel:", response.data);
                            displayResults(response.data);
                        } else if (response && response.status === "not_found") {
                            statusBadge.textContent = "Unavailable";
                            statusBadge.className = "status-badge unknown";
                            confidenceDiv.textContent = "Analysis not yet complete or page not supported.";
                            factCheckResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No analysis results available yet.</div>';
                            newsResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No analysis results available yet.</div>';
                        } else {
                            statusBadge.textContent = "Error";
                            statusBadge.className = "status-badge unknown";
                            confidenceDiv.textContent = "Could not retrieve analysis results.";
                            factCheckResultsContainer.innerHTML = '<div class="text-red-500 p-4">Failed to load results.</div>';
                            newsResultsContainer.innerHTML = '<div class="text-red-500 p-4">Failed to load results.</div>';
                        }
                    }
                );
            } else {
                statusBadge.textContent = "Error";
                statusBadge.className = "status-badge unknown";
                confidenceDiv.textContent = "Cannot identify the current tab to load results.";
                factCheckResultsContainer.innerHTML = '<div class="text-red-500 p-4">Tab identification error.</div>';
                newsResultsContainer.innerHTML = '<div class="text-red-500 p-4">Tab identification error.</div>';
            }
        });
    }

    // Initial load when the sidepanel opens
    loadResultsForCurrentTab();
    
    // Properly initialize the theme handling
    initializeTheme().catch(e => {
        console.error("Error initializing theme:", e);
    });

    // Set up refresh button if it exists
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', loadResultsForCurrentTab);
    }
});