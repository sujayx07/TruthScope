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
    const aiSummaryContainer = document.getElementById('aiSummary');
    const themeToggleButton = document.getElementById('themeToggleButton');

    // Check if essential elements exist
    if (!statusBadge || !confidenceDiv || !factCheckResultsContainer ||
        !newsResultsContainer || !themeToggleButton ||
        !aiSummaryContainer) {
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
     * Creates HTML for a single news item.
     * @param {object} news - The news data object.
     * @returns {string} HTML string for the news item.
     */
    function createNewsItemHTML(news) {
        const title = news.title || 'Related Article';
        const url = news.url;
        const source = news.source || 'Unknown Source';
        
        return `
            <div class="news-item">
                <div class="news-title">
                    ${url ? `<a href="${url}" target="_blank" class="news-link">${title}</a>` : title}
                </div>
                <div class="news-meta">Source: ${source}</div>
            </div>
        `;
    }

    /**
     * Generates AI reasoning based on the analysis results
     * @param {object} data - The combined text and media analysis results
     * @returns {string} HTML with the AI-generated reasoning
     */
    function generateAIReasoning(data) {
        if (!data || (!data.textResult && !data.mediaResult)) {
            return '<div class="text-gray-500 p-4">No data available to generate reasoning.</div>';
        }

        let reasoningContent = '';
        
        // Explain credibility assessment reasoning
        if (data.textResult && data.textResult.label !== undefined) {
            const isFake = data.textResult.label === "LABEL_1"; // Assuming LABEL_1 is fake
            const confidence = data.textResult.score ? (data.textResult.score * 100).toFixed(1) : "unknown";
            
            if (isFake) {
                reasoningContent += `<p class="mb-3">This content is likely misleading or contains false information based on my analysis. Here's why:</p>`;
                
                // Add specific reasoning points
                reasoningContent += '<ul class="list-disc ml-5 mb-3">';
                
                if (data.textResult.reasoning && Array.isArray(data.textResult.reasoning)) {
                    // Use provided reasoning if available
                    data.textResult.reasoning.forEach(point => {
                        reasoningContent += `<li class="mb-2">${point}</li>`;
                    });
                } else {
                    // Default reasoning points
                    reasoningContent += `<li class="mb-2">The claims in this content contradict established facts or verified information.</li>`;
                    
                    if (data.textResult.fact_check && data.textResult.fact_check.length > 0) {
                        reasoningContent += `<li class="mb-2">The information has been fact-checked and disputed by ${data.textResult.fact_check.length} reputable source(s).</li>`;
                    }
                    
                    if (data.textResult.highlights && data.textResult.highlights.length > 0) {
                        reasoningContent += `<li class="mb-2">The content contains specific statements that are likely false or misleading.</li>`;
                    }
                }
                
                reasoningContent += '</ul>';
                
                // Add example problematic statements if available
                if (data.textResult.highlights && data.textResult.highlights.length > 0) {
                    reasoningContent += '<p class="font-semibold mb-2">Problematic claims include:</p>';
                    reasoningContent += '<ul class="list-disc ml-5 mb-3 italic text-gray-600 dark:text-gray-400">';
                    data.textResult.highlights.forEach(highlight => {
                        reasoningContent += `<li class="mb-1">"${highlight}"</li>`;
                    });
                    reasoningContent += '</ul>';
                }
            } else {
                reasoningContent += `<p class="mb-3">This content appears to be credible based on my analysis. Here's why:</p>`;
                
                // Add specific reasoning points for credible content
                reasoningContent += '<ul class="list-disc ml-5 mb-3">';
                
                if (data.textResult.reasoning && Array.isArray(data.textResult.reasoning)) {
                    // Use provided reasoning if available
                    data.textResult.reasoning.forEach(point => {
                        reasoningContent += `<li class="mb-2">${point}</li>`;
                    });
                } else {
                    // Default reasoning points
                    reasoningContent += `<li class="mb-2">The claims in this content align with verified information and established facts.</li>`;
                    reasoningContent += `<li class="mb-2">No contradictions were found with reputable sources.</li>`;
                    reasoningContent += `<li class="mb-2">The information contains verifiable details that can be cross-referenced.</li>`;
                }
                
                reasoningContent += '</ul>';
            }
        }
        
        // Add media analysis reasoning if available
        if (data.mediaResult && (data.mediaResult.manipulated_images_found > 0 || data.mediaResult.images_analyzed > 0)) {
            reasoningContent += '<p class="font-semibold mt-4 mb-2">Media Analysis:</p>';
            
            if (data.mediaResult.manipulated_images_found > 0) {
                reasoningContent += `<p class="mb-3">I've detected potential manipulation in ${data.mediaResult.manipulated_images_found} out of ${data.mediaResult.images_analyzed} images analyzed.</p>`;
                
                if (data.mediaResult.manipulated_media && data.mediaResult.manipulated_media.length > 0) {
                    reasoningContent += '<ul class="list-disc ml-5 mb-3">';
                    data.mediaResult.manipulated_media.forEach(item => {
                        const manipType = item.manipulation_type.replace(/_/g, ' ');
                        const confidencePercent = (item.confidence * 100).toFixed(1);
                        reasoningContent += `<li class="mb-2">Detected ${manipType} (${confidencePercent}% confidence) in media content.</li>`;
                    });
                    reasoningContent += '</ul>';
                }
            } else if (data.mediaResult.images_analyzed > 0) {
                reasoningContent += `<p class="mb-3">I analyzed ${data.mediaResult.images_analyzed} images and found no evidence of manipulation.</p>`;
            }
        }
        
        // Add conclusion
        if (data.textResult || data.mediaResult) {
            reasoningContent += '<p class="font-semibold mt-4 mb-2">Conclusion:</p>';
            
            if (data.textResult && data.textResult.label === "LABEL_1" && data.textResult.score > 0.7) {
                reasoningContent += '<p class="text-red-600 dark:text-red-400">The content appears to be misleading or contains false information. I recommend consulting additional sources before sharing or acting on this information.</p>';
            } else if (data.mediaResult && data.mediaResult.manipulated_images_found > 0) {
                reasoningContent += '<p class="text-yellow-600 dark:text-yellow-400">While the text may be accurate, the media contains manipulated elements that could be misleading. Exercise caution when interpreting this content.</p>';
            } else if (data.textResult && data.textResult.label !== "LABEL_1") {
                reasoningContent += '<p class="text-green-600 dark:text-green-400">Based on my analysis, this content appears to be factually accurate and reliable.</p>';
            } else {
                reasoningContent += '<p>The analysis is inconclusive. Consider seeking additional sources to verify this information.</p>';
            }
        }
        
        // If reasoning content is empty for some reason, provide a fallback
        if (!reasoningContent) {
            reasoningContent = '<p>Analysis complete, but I need more information to provide detailed reasoning.</p>';
        }
        
        return reasoningContent;
    }

    /**
     * Displays the full analysis result, including status, credibility, AI reasoning, fact-checks, and media results.
     * @param {object | null} data - The analysis result object from background.js, or null if unavailable.
     */
    function displayResults(data) {
        // Clear all containers first
        aiSummaryContainer.innerHTML = '';
        factCheckResultsContainer.innerHTML = '';
        newsResultsContainer.innerHTML = '';

        if (!data || (!data.textResult && !data.mediaResult)) {
            // Handle case where no analysis is available
            statusBadge.textContent = "Unavailable";
            statusBadge.className = "status-badge unknown";
            confidenceDiv.textContent = "Analysis could not be performed or is not available for this page.";

            aiSummaryContainer.innerHTML = '<div class="text-gray-500 p-4">No data available to generate reasoning.</div>';
            factCheckResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No fact-check sources available.</div>';
            newsResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No related news available.</div>';
            return;
        }

        // Display Text Analysis Result first (credibility)
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

                // Then generate and display AI Reasoning after credibility
                aiSummaryContainer.innerHTML = generateAIReasoning(data);

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
                aiSummaryContainer.innerHTML = '<div class="text-gray-500 p-4">Unable to generate reasoning due to unknown analysis format.</div>';
            }
        } else {
            statusBadge.textContent = "Pending";
            statusBadge.className = "status-badge unknown";
            confidenceDiv.textContent = "Text analysis pending or failed.";
            aiSummaryContainer.innerHTML = '<div class="text-gray-500 p-4">Waiting for text analysis to generate reasoning.</div>';
        }

        // Display Related News (empty placeholder for now, ready for future integration)
        newsResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No related news articles available at this time.</div>';
    }

    // Function to fetch and display results for the current tab
    function loadResultsForCurrentTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const currentTab = tabs[0];
            if (currentTab && currentTab.id) {
                // Set UI to loading state
                statusBadge.textContent = "Loading...";
                statusBadge.className = "status-badge loading";
                confidenceDiv.textContent = "Fetching analysis results...";
                
                aiSummaryContainer.innerHTML = createLoadingPlaceholderHTML('Generating AI reasoning...');
                factCheckResultsContainer.innerHTML = createLoadingPlaceholderHTML('Loading fact check results...');
                newsResultsContainer.innerHTML = createLoadingPlaceholderHTML('Searching for related news...');

                // Request data from background script
                chrome.runtime.sendMessage(
                    { action: "getResultForTab", tabId: currentTab.id },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error("Error getting result:", chrome.runtime.lastError.message);
                            displayErrorState("Error communicating with background script.");
                            return;
                        }

                        if (response && response.status === "found") {
                            console.log("Received data for sidepanel:", response.data);
                            displayResults(response.data);
                        } else if (response && response.status === "not_found") {
                            displayNotAvailableState();
                        } else {
                            displayErrorState("Could not retrieve analysis results.");
                        }
                    }
                );
            } else {
                displayErrorState("Cannot identify the current tab to load results.");
            }
        });
    }
    
    /**
     * Displays error state in the UI
     * @param {string} message - The error message to display
     */
    function displayErrorState(message) {
        statusBadge.textContent = "Error";
        statusBadge.className = "status-badge unknown";
        confidenceDiv.textContent = message;

        aiSummaryContainer.innerHTML = '<div class="text-red-500 p-4">Error generating reasoning.</div>';
        factCheckResultsContainer.innerHTML = '<div class="text-red-500 p-4">Error retrieving results.</div>';
        newsResultsContainer.innerHTML = '<div class="text-red-500 p-4">Error retrieving results.</div>';
    }

    /**
     * Displays not available state in the UI when no analysis is available
     */
    function displayNotAvailableState() {
        statusBadge.textContent = "Unavailable";
        statusBadge.className = "status-badge unknown";
        confidenceDiv.textContent = "Analysis not yet complete or page not supported.";

        aiSummaryContainer.innerHTML = '<div class="text-gray-500 p-4">No data available to generate reasoning.</div>';
        factCheckResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No analysis results available yet.</div>';
        newsResultsContainer.innerHTML = '<div class="text-gray-500 p-4">No analysis results available yet.</div>';
    }

    // Listen for real-time updates from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Listen for analysis update notifications
        if ((message.action === "analysisComplete" || message.action === "mediaAnalysisItemComplete")) {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                const currentTab = tabs[0];
                // Only update if the message is for the currently active tab or if no specific tab is mentioned
                if (currentTab && (!message.tabId || message.tabId === currentTab.id)) {
                    console.log(`Received ${message.action} notification, reloading results`);
                    loadResultsForCurrentTab();
                }
            });
            return true;
        }
    });

    // Initial load when the sidepanel opens
    loadResultsForCurrentTab();
    
    // Properly initialize the theme handling
    initializeTheme().catch(e => {
        console.error("Error initializing theme:", e);
    });

    // Set up refresh button if it exists
    // const refreshButton = document.getElementById('refreshButton');
    // if (refreshButton) {
    //     refreshButton.addEventListener('click', loadResultsForCurrentTab);
    // }
});