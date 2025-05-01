document.addEventListener('DOMContentLoaded', function() {
    const analyzeButton = document.getElementById('analyzeButton');
    const resultDiv = document.getElementById('result');
    const statusDiv = document.getElementById('statusMessage');
    const statusIndicator = document.getElementById('statusIndicator');
    const actionButton = document.getElementById('actionButton');
    const themeToggleButton = document.getElementById('themeToggleButton'); // Add reference to theme toggle button

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
        if (!data || (!data.textResult && !data.mediaResult)) {
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