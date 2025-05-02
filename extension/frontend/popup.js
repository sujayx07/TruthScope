document.addEventListener('DOMContentLoaded', function() {
    const analyzeButton = document.getElementById('analyzeButton');
    const resultDiv = document.getElementById('result');
    const statusDiv = document.getElementById('statusMessage');
    const statusIndicator = document.getElementById('statusIndicator');
    const actionButton = document.getElementById('actionButton');
    const themeToggleButton = document.getElementById('themeToggleButton'); // Add reference to theme toggle button
    const sentimentBiasSection = document.getElementById('sentimentBiasSection'); // New
    const sentimentDisplay = document.getElementById('sentimentDisplay'); // New
    const biasTags = document.getElementById('biasTags'); // New

    // --- Theme Handling Code ---
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

        // Update toggle button title if it exists
        if (themeToggleButton) {
            const currentIndex = THEMES.indexOf(storedPreference);
            const nextIndex = (currentIndex + 1) % THEMES.length;
            const nextTheme = THEMES[nextIndex];
            themeToggleButton.title = `Change theme (currently ${storedPreference}, next: ${nextTheme})`;
        }
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

        // Set up theme toggle button if it exists
        if (themeToggleButton) {
            themeToggleButton.addEventListener('click', cycleTheme);
        }

        // Listen for system theme changes
        prefersDark.addEventListener('change', async () => {
            const currentStoredTheme = await getStoredTheme();
            if (currentStoredTheme === 'system') {
                applyThemeUI('system'); // Re-apply based on new system preference
            }
        });

        // Listen for changes from storage (e.g., sidepanel changing the theme)
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.theme) {
                const newThemePreference = changes.theme.newValue || 'system';
                applyThemeUI(newThemePreference);
            }
        });
    }

    // --- End of Theme Handling Code ---

    // Function to update UI based on analysis result
    function updateUI(data) {
        // Clear previous sentiment/bias display
        sentimentBiasSection.classList.add('hidden');
        sentimentDisplay.textContent = '';
        sentimentDisplay.className = 'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded mr-1'; // Reset classes
        biasTags.innerHTML = '';

        if (!data || (!data.textResult && !data.mediaResult && !data.sentimentBiasResult)) { // Check all potential data sources
            statusDiv.textContent = 'No analysis data available for this page yet.';
            
            // Reset status indicator
            statusIndicator.className = 'status-indicator unknown';
            statusIndicator.innerHTML = `
                <div class="flex items-center gap-1.5">
                    <div class="icon">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <span>Unknown</span>
                </div>
            `;
            
            actionButton.textContent = 'View Details';
            return;
        }

        // Display Text Analysis Result (Focus on isFake for popup)
        if (data.textResult) {
            if (data.textResult.error) {
                statusDiv.textContent = `Error: ${data.textResult.error}`;
                // Set status indicator to unknown
                statusIndicator.className = 'status-indicator unknown';
                statusIndicator.innerHTML = `
                    <div class="flex items-center gap-1.5">
                        <div class="icon">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <span>Error</span>
                    </div>
                `;
            } else if (data.textResult.label !== undefined) {
                const isFake = data.textResult.label === "LABEL_1"; // Assuming LABEL_1 is fake
                const confidence = (data.textResult.score * 100).toFixed(1);
                
                statusDiv.textContent = `${isFake ? 'This content may be misleading' : 'This content appears to be authentic'}`;
                
                // Update status indicator
                if (isFake) {
                    statusIndicator.className = 'status-indicator fake';
                    statusIndicator.innerHTML = `
                        <div class="flex items-center gap-1.5">
                            <div class="icon">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                            <span>Misleading</span>
                        </div>
                    `;
                    actionButton.textContent = 'View Issues';
                } else {
                    statusIndicator.className = 'status-indicator real';
                    statusIndicator.innerHTML = `
                        <div class="flex items-center gap-1.5">
                            <div class="icon">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <span>Verified</span>
                        </div>
                    `;
                    actionButton.textContent = 'View Verification';
                }
            } else {
                statusDiv.textContent = 'Analysis result format unknown.';
                statusIndicator.className = 'status-indicator unknown';
            }
        } else {
            statusDiv.textContent = 'Text analysis pending or failed.';
            statusIndicator.className = 'status-indicator unknown pulse-animation';
        }

        // --- NEW: Display Sentiment and Bias --- 
        if (data.sentimentBiasResult && !data.sentimentBiasResult.error) {
            sentimentBiasSection.classList.remove('hidden');

            // Display Sentiment
            const sentiment = data.sentimentBiasResult.sentiment;
            if (sentiment && !sentiment.error) {
                let sentimentText = 'Neutral';
                let sentimentColorClass = 'bg-gray-400 text-gray-900'; // Default: Neutral
                let sentimentIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" /></svg>`; // Neutral icon

                if (sentiment.label === 'positive') {
                    sentimentText = 'Positive';
                    sentimentColorClass = 'bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-100';
                    sentimentIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>`; // Plus icon
                } else if (sentiment.label === 'negative') {
                    sentimentText = 'Negative';
                    sentimentColorClass = 'bg-red-200 text-red-800 dark:bg-red-700 dark:text-red-100';
                    sentimentIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12h-15" /></svg>`; // Minus icon
                }
                sentimentDisplay.innerHTML = `${sentimentIcon} ${sentimentText}`;
                sentimentDisplay.classList.add(...sentimentColorClass.split(' '));
            } else {
                sentimentDisplay.textContent = 'Sentiment N/A';
                sentimentDisplay.classList.add('bg-gray-300', 'text-gray-700');
            }

            // Display Bias Tags
            const bias = data.sentimentBiasResult.bias;
            if (bias && bias.indicators && bias.indicators.length > 0) {
                bias.indicators.slice(0, 3).forEach(indicator => { // Limit to 3 tags for popup
                    const tag = document.createElement('span');
                    tag.className = 'inline-flex items-center gap-1 bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100 text-xs font-medium px-2 py-0.5 rounded';
                    // Simple tag icon
                    tag.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
                                   ${indicator.charAt(0).toUpperCase() + indicator.slice(1)}`; // Capitalize
                    biasTags.appendChild(tag);
                });
            } else if (bias && bias.summary && !bias.indicators?.length) {
                 // Optionally show summary if no specific tags
                 // const summaryTag = document.createElement('span');
                 // summaryTag.className = 'text-xs text-gray-500 dark:text-gray-400';
                 // summaryTag.textContent = bias.summary;
                 // biasTags.appendChild(summaryTag);
            }
        } else if (data.sentimentBiasResult && data.sentimentBiasResult.error) {
            console.warn("Sentiment/Bias analysis error:", data.sentimentBiasResult.error);
            // Optionally display an error indicator for sentiment/bias
        }
        // --- END NEW SECTION ---
    }

    // Get the current tab and request results from background script
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const currentTab = tabs[0];
        if (currentTab && currentTab.id) {
            statusDiv.textContent = 'Loading analysis results...';
            statusIndicator.className = 'status-indicator unknown pulse-animation';
            chrome.runtime.sendMessage(
                { action: "getResultForTab", tabId: currentTab.id },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error getting result:", chrome.runtime.lastError.message);
                        statusDiv.textContent = 'Error communicating with background script.';
                        return;
                    }

                    if (response && response.status === "found") {
                        console.log("Received data for popup:", response.data);
                        updateUI(response.data);
                    } else if (response && response.status === "not_found") {
                        statusDiv.textContent = 'Analysis not yet complete or page not supported.';
                        // Keep the pulsing analyzig state
                        statusIndicator.className = 'status-indicator unknown pulse-animation';
                    } else {
                        statusDiv.textContent = 'Could not retrieve analysis results.';
                        statusIndicator.className = 'status-indicator unknown';
                    }
                }
            );
        } else {
            statusDiv.textContent = 'Cannot identify the current tab.';
            statusIndicator.className = 'status-indicator unknown';
        }
    });

    // Setup the action button to open the side panel
    if (actionButton) {
        actionButton.addEventListener('click', function() {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs[0]) {
                    chrome.sidePanel.open({ tabId: tabs[0].id });
                }
            });
        });
    }
    
    // Initialize theme handling
    initializeTheme().catch(e => {
        console.error("Error initializing theme:", e);
    });
});