/**
 * @fileoverview Sidepanel script for TruthScope extension.
 * Handles theme switching, UI updates based on auth state (managed by background.js),
 * requesting analysis data, and displaying results.
 */

document.addEventListener('DOMContentLoaded', function() {
    // --- DOM Element References ---
    const statusBadge = document.getElementById('statusBadge');
    const confidenceDiv = document.getElementById('confidence');
    const factCheckResultsContainer = document.getElementById('factCheckResults');
    const newsResultsContainer = document.getElementById('newsResults');
    const aiSummaryContainer = document.getElementById('aiSummary');
    const themeToggleButton = document.getElementById('themeToggleButton');
    // Auth elements
    const authContainer = document.getElementById('authContainer');
    const signInButton = document.getElementById('signInButton');
    const userInfoDiv = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');

    // Check if essential elements exist
    if (!statusBadge || !confidenceDiv || !factCheckResultsContainer ||
        !newsResultsContainer || !themeToggleButton || !aiSummaryContainer ||
        !authContainer || !signInButton || !userInfoDiv || !userAvatar) {
        console.error("TruthScope Sidepanel Error: One or more essential UI elements are missing.");
        const errorContainer = document.querySelector('.max-w-4xl.mx-auto') || document.body;
        errorContainer.innerHTML = '<div class="p-4 text-red-600 dark:text-red-400">Error: Sidepanel UI failed to load correctly. Please try reloading the extension or contact support.</div>';
        return;
    }

    // --- Authentication State (Mirrors background state) ---
    let isSignedIn = false;
    let currentUserProfile = null;

    /**
     * Updates the UI based on the *local* authentication state.
     * This state is updated by messages from the background script.
     */
    function updateAuthStateUI() {
        console.log("Sidepanel: Updating UI based on state:", { isSignedIn, currentUserProfile });
        if (isSignedIn && currentUserProfile) {
            signInButton.classList.add('hidden');
            userInfoDiv.classList.remove('hidden');
            userInfoDiv.classList.add('flex');
            userAvatar.src = currentUserProfile.picture || 'avatar.png';
            userAvatar.alt = currentUserProfile.email || 'User Avatar';
            userAvatar.title = currentUserProfile.email || 'User Profile';
            signInButton.disabled = false; // Ensure sign-in button is usable if shown later
            signInButton.textContent = "Sign in";
        } else {
            signInButton.classList.remove('hidden');
            userInfoDiv.classList.add('hidden');
            userInfoDiv.classList.remove('flex');
            userAvatar.src = 'avatar.png';
            userAvatar.alt = 'User Avatar';
            userAvatar.title = 'Sign in required';
            signInButton.disabled = false;
            signInButton.textContent = "Sign in";
            // Clear results and show sign-in prompt if not signed in
            clearResultsDisplay();
            displaySignInRequiredState();
        }
    }

    /**
     * Handles the sign-in button click by sending a message to the background script.
     */
    async function handleSignInClick() {
        console.log("Sidepanel: Sign-in button clicked, sending message to background.");
        signInButton.disabled = true;
        signInButton.textContent = "Signing in...";
        try {
            const response = await chrome.runtime.sendMessage({ action: "signIn" });
            console.log("Sidepanel: Received response from background signIn:", response);
            if (response && response.success) {
                console.log("Sidepanel: Sign-in reported successful by background.");
            } else {
                console.error("Sidepanel: Sign-in failed:", response?.error);
                signInButton.disabled = false;
                signInButton.textContent = "Sign in with Google";
                displayErrorState(response?.error || "Sign-in failed. Please try again.");
                isSignedIn = false;
                currentUserProfile = null;
                updateAuthStateUI();
            }
        } catch (error) {
            console.error("Sidepanel: Error sending signIn message or processing response:", error);
            signInButton.disabled = false;
            signInButton.textContent = "Sign in";
            displayErrorState(`Sign-in error: ${error.message}. Please ensure the extension is active.`);
            isSignedIn = false;
            currentUserProfile = null;
            updateAuthStateUI();
        }
    }

    /**
     * Handles the sign-out button click by sending a message to the background script.
     */
    async function handleSignOutClick() {
        console.log("Sidepanel: Sign-out initiated via avatar, sending message to background.");
        try {
            await chrome.runtime.sendMessage({ action: "signOut" });
            console.log("Sidepanel: signOut message sent.");
        } catch (error) {
            console.error("Sidepanel: Error sending signOut message:", error);
            displayErrorState(`Sign-out error: ${error.message}`);
        }
    }

    /**
     * Clears all result display areas.
     */
    function clearResultsDisplay() {
        statusBadge.textContent = "";
        statusBadge.className = "status-badge"; // Reset class
        confidenceDiv.textContent = "";
        aiSummaryContainer.innerHTML = "";
        factCheckResultsContainer.innerHTML = "";
        newsResultsContainer.innerHTML = "";
    }

    /**
     * Displays a message prompting the user to sign in.
     */
    function displaySignInRequiredState() {
        clearResultsDisplay(); // Clear previous results first
        statusBadge.textContent = "Sign In";
        statusBadge.className = "status-badge unknown";
        confidenceDiv.textContent = "Please sign in to analyze content.";

        const signInMessage = '<div class="text-gray-500 dark:text-gray-400 p-4 text-center">Sign in with Google to use TruthScope analysis features.</div>';
        aiSummaryContainer.innerHTML = signInMessage;
        factCheckResultsContainer.innerHTML = ''; // Keep empty or add similar message
        newsResultsContainer.innerHTML = ''; // Keep empty or add similar message
    }

    // --- Theme Handling ---
    const THEMES = ['light', 'dark', 'system'];
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    async function getStoredTheme() {
        try {
            const result = await chrome.storage.local.get(['theme']);
            return THEMES.includes(result.theme) ? result.theme : 'system';
        } catch (error) {
            console.error("Error getting theme preference:", error);
            return 'system'; // Default to system on error
        }
    }

    function applyThemeUI(storedPreference) {
        const htmlElement = document.documentElement;
        htmlElement.classList.remove('light', 'dark', 'theme-preference-system'); // Remove all theme-related classes

        let themeToApply = storedPreference;
        if (storedPreference === 'system') {
            themeToApply = prefersDark.matches ? 'dark' : 'light';
            htmlElement.classList.add('theme-preference-system');
        }
        htmlElement.classList.add(themeToApply); // Add 'light' or 'dark' class for actual appearance

        const currentIndex = THEMES.indexOf(storedPreference);
        const nextIndex = (currentIndex + 1) % THEMES.length;
        const nextTheme = THEMES[nextIndex];
        themeToggleButton.title = `Change theme (currently ${storedPreference}, next: ${nextTheme})`;
    }

    async function cycleTheme() {
        try {
            const currentStoredTheme = await getStoredTheme();
            const currentIndex = THEMES.indexOf(currentStoredTheme);
            const nextTheme = THEMES[(currentIndex + 1) % THEMES.length];
            await chrome.storage.local.set({ theme: nextTheme });
            applyThemeUI(nextTheme);
        } catch (error) {
            console.error("Error cycling theme:", error);
        }
    }

    async function initializeTheme() {
        const initialTheme = await getStoredTheme();
        applyThemeUI(initialTheme);

        themeToggleButton.addEventListener('click', cycleTheme);

        prefersDark.addEventListener('change', async () => {
            const currentStoredTheme = await getStoredTheme();
            if (currentStoredTheme === 'system') {
                applyThemeUI('system'); // Re-apply based on new system preference
            }
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.theme) {
                const newThemePreference = changes.theme.newValue || 'system';
                applyThemeUI(newThemePreference);
            }
        });
    }

    // --- Data Display ---
    function createLoadingPlaceholderHTML(text) {
        return `
            <div class="loading-placeholder">
                <div class="spinner"></div>
                <span>${text}</span>
            </div>
        `;
    }

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

    function generateAIReasoning(data) {
        if (!data || (!data.textResult && !data.mediaResult)) {
            return '<div class="text-gray-500 dark:text-gray-400 p-4">No data available to generate reasoning.</div>';
        }

        let reasoningContent = '';
        
        // Explain credibility assessment reasoning
        if (data.textResult && data.textResult.label !== undefined) {
            const isFake = data.textResult.label === "LABEL_1"; // Assuming LABEL_1 is fake
            const confidence = data.textResult.score ? (data.textResult.score * 100).toFixed(1) : "unknown";
            
            if (isFake) {
                reasoningContent += `<p class="mb-3">This content is likely misleading or contains false information based on my analysis. Here's why:</p>`;
                reasoningContent += '<ul class="list-disc ml-5 mb-3">';
                if (data.textResult.reasoning && Array.isArray(data.textResult.reasoning)) {
                    data.textResult.reasoning.forEach(point => { reasoningContent += `<li class="mb-2">${point}</li>`; });
                } else {
                    reasoningContent += `<li class="mb-2">The claims contradict established facts or verified information.</li>`;
                    if (data.textResult.fact_check && data.textResult.fact_check.length > 0) {
                        reasoningContent += `<li class="mb-2">Disputed by ${data.textResult.fact_check.length} reputable source(s).</li>`;
                    }
                    if (data.textResult.highlights && data.textResult.highlights.length > 0) {
                        reasoningContent += `<li class="mb-2">Contains specific statements likely false or misleading.</li>`;
                    }
                }
                reasoningContent += '</ul>';
                if (data.textResult.highlights && data.textResult.highlights.length > 0) {
                    reasoningContent += '<p class="font-semibold mb-2">Problematic claims include:</p>';
                    reasoningContent += '<ul class="list-disc ml-5 mb-3 italic text-gray-600 dark:text-gray-400">';
                    data.textResult.highlights.forEach(highlight => { reasoningContent += `<li class="mb-1">"${highlight}"</li>`; });
                    reasoningContent += '</ul>';
                }
            } else {
                reasoningContent += `<p class="mb-3">This content appears to be credible based on my analysis. Here's why:</p>`;
                reasoningContent += '<ul class="list-disc ml-5 mb-3">';
                if (data.textResult.reasoning && Array.isArray(data.textResult.reasoning)) {
                    data.textResult.reasoning.forEach(point => { reasoningContent += `<li class="mb-2">${point}</li>`; });
                } else {
                    reasoningContent += `<li class="mb-2">Claims align with verified information.</li>`;
                    reasoningContent += `<li class="mb-2">No contradictions found with reputable sources.</li>`;
                    reasoningContent += `<li class="mb-2">Contains verifiable details.</li>`;
                }
                reasoningContent += '</ul>';
            }
        }
        
        // Add media analysis reasoning if available
        if (data.mediaResult && (data.mediaResult.manipulated_images_found > 0 || data.mediaResult.images_analyzed > 0)) {
            reasoningContent += '<p class="font-semibold mt-4 mb-2">Media Analysis:</p>';
            if (data.mediaResult.manipulated_images_found > 0) {
                reasoningContent += `<p class="mb-3">Detected potential manipulation in ${data.mediaResult.manipulated_images_found} of ${data.mediaResult.images_analyzed} images.</p>`;
                if (data.mediaResult.manipulated_media && data.mediaResult.manipulated_media.length > 0) {
                    reasoningContent += '<ul class="list-disc ml-5 mb-3">';
                    data.mediaResult.manipulated_media.forEach(item => {
                        const manipType = item.manipulation_type.replace(/_/g, ' ');
                        const confidencePercent = (item.confidence * 100).toFixed(1);
                        reasoningContent += `<li class="mb-2">Detected ${manipType} (${confidencePercent}% confidence).</li>`;
                    });
                    reasoningContent += '</ul>';
                }
            } else if (data.mediaResult.images_analyzed > 0) {
                reasoningContent += `<p class="mb-3">Analyzed ${data.mediaResult.images_analyzed} images; no manipulation detected.</p>`;
            }
        }
        
        // Add conclusion
        if (data.textResult || data.mediaResult) {
            reasoningContent += '<p class="font-semibold mt-4 mb-2">Conclusion:</p>';
            if (data.textResult && data.textResult.label === "LABEL_1" && data.textResult.score > 0.7) {
                reasoningContent += '<p class="text-red-600 dark:text-red-400">Content appears misleading. Consult additional sources.</p>';
            } else if (data.mediaResult && data.mediaResult.manipulated_images_found > 0) {
                reasoningContent += '<p class="text-yellow-600 dark:text-yellow-400">Media contains manipulated elements. Exercise caution.</p>';
            } else if (data.textResult && data.textResult.label !== "LABEL_1") {
                reasoningContent += '<p class="text-green-600 dark:text-green-400">Content appears factually accurate and reliable.</p>';
            } else {
                reasoningContent += '<p>Analysis inconclusive. Seek additional sources.</p>';
            }
        }
        
        if (!reasoningContent) {
            reasoningContent = '<p>Analysis complete, but more information needed for detailed reasoning.</p>';
        }
        return reasoningContent;
    }

    function displayResults(data) {
        clearResultsDisplay(); // Ensure clean slate

        if (!data || (!data.textResult && !data.mediaResult)) {
            statusBadge.textContent = "Unavailable";
            statusBadge.className = "status-badge unknown";
            confidenceDiv.textContent = "Analysis could not be performed or is not available.";
            aiSummaryContainer.innerHTML = '<div class="text-gray-500 dark:text-gray-400 p-4">No data available.</div>';
            factCheckResultsContainer.innerHTML = '<div class="text-gray-500 dark:text-gray-400 p-4">No fact-check sources available.</div>';
            newsResultsContainer.innerHTML = '<div class="text-gray-500 dark:text-gray-400 p-4">No related news available.</div>';
            return;
        }

        // Display Text Analysis Result (credibility)
        if (data.textResult) {
            if (data.textResult.error) {
                statusBadge.textContent = "Error";
                statusBadge.className = "status-badge unknown";
                confidenceDiv.textContent = `Error: ${data.textResult.error}`;
                factCheckResultsContainer.innerHTML = '<div class="text-gray-500 dark:text-gray-400 p-4">No fact-check sources due to error.</div>';
            } else if (data.textResult.label !== undefined) {
                const isFake = data.textResult.label === "LABEL_1";
                const confidence = (data.textResult.score * 100).toFixed(1);
                statusBadge.textContent = isFake ? "Potential Misinformation" : "Likely Credible";
                statusBadge.className = `status-badge ${isFake ? 'fake' : 'real'}`;
                confidenceDiv.textContent = `Confidence Score: ${confidence}%`;

                // Display fact-check results if available
                if (data.textResult.fact_check && Array.isArray(data.textResult.fact_check) && data.textResult.fact_check.length > 0) {
                    const factsHtml = data.textResult.fact_check.map(createSourceItemHTML).join('');
                    factCheckResultsContainer.innerHTML = factsHtml;
                } else {
                    factCheckResultsContainer.innerHTML = '<div class="text-gray-500 dark:text-gray-400 p-4">No fact-check sources found.</div>';
                }
            } else {
                statusBadge.textContent = "Unknown";
                statusBadge.className = "status-badge unknown";
                confidenceDiv.textContent = "Analysis format unknown.";
            }
        } else {
            statusBadge.textContent = "Pending";
            statusBadge.className = "status-badge unknown";
            confidenceDiv.textContent = "Text analysis pending or failed.";
        }

        // Generate and display AI Reasoning (uses both text and media results)
        aiSummaryContainer.innerHTML = generateAIReasoning(data);

        // Display Related News (placeholder)
        newsResultsContainer.innerHTML = '<div class="text-gray-500 dark:text-gray-400 p-4">No related news articles available.</div>';
    }

    // --- Data Fetching ---

    /**
     * Requests and displays results for the current tab from the background script.
     * Requires user to be signed in (checks local isSignedIn state).
     */
    function loadResultsForCurrentTab() {
        // *** Check local authentication state ***
        if (!isSignedIn) {
            console.log("Sidepanel: User not signed in locally. Displaying sign-in prompt.");
            displaySignInRequiredState(); // Show sign-in prompt instead of loading
            return; // Do not proceed if not signed in
        }

        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const currentTab = tabs[0];
            if (currentTab && currentTab.id) {
                console.log(`Sidepanel: Requesting results for tab ${currentTab.id} from background.`);
                // Set UI to loading state
                statusBadge.textContent = "Loading...";
                statusBadge.className = "status-badge loading";
                confidenceDiv.textContent = "Fetching analysis results...";
                
                aiSummaryContainer.innerHTML = createLoadingPlaceholderHTML('Generating AI reasoning...');
                factCheckResultsContainer.innerHTML = createLoadingPlaceholderHTML('Loading fact check results...');
                newsResultsContainer.innerHTML = createLoadingPlaceholderHTML('Searching for related news...');

                // Request data from background script (NO TOKEN NEEDED HERE)
                chrome.runtime.sendMessage(
                    { 
                        action: "getResultForTab", 
                        tabId: currentTab.id 
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error("Sidepanel: Error getting result:", chrome.runtime.lastError.message);
                            displayErrorState("Error communicating with background script.");
                            return;
                        }

                        console.log("Sidepanel: Received response from getResultForTab:", response);

                        if (response && response.status === "found") {
                            displayResults(response.data);
                        } else if (response && response.status === "not_found") {
                            displayNotAvailableState();
                        } else if (response && response.status === "auth_error") {
                            console.error("Sidepanel: Auth error reported by background.");
                            displayErrorState("Authentication failed. Please sign out and sign back in.");
                            isSignedIn = false;
                            currentUserProfile = null;
                            updateAuthStateUI(); 
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
        clearResultsDisplay();
        statusBadge.textContent = "Error";
        statusBadge.className = "status-badge unknown";
        confidenceDiv.textContent = message;

        const errorMessage = `<div class="text-red-500 dark:text-red-400 p-4">${message}</div>`;
        aiSummaryContainer.innerHTML = errorMessage;
        factCheckResultsContainer.innerHTML = '';
        newsResultsContainer.innerHTML = '';
    }

    /**
     * Displays not available state in the UI when no analysis is available
     */
    function displayNotAvailableState() {
        clearResultsDisplay();
        statusBadge.textContent = "Unavailable";
        statusBadge.className = "status-badge unknown";
        confidenceDiv.textContent = "Analysis not yet complete or page not supported.";

        aiSummaryContainer.innerHTML = '<div class="text-gray-500 dark:text-gray-400 p-4">No data available to generate reasoning.</div>';
        factCheckResultsContainer.innerHTML = '<div class="text-gray-500 dark:text-gray-400 p-4">No analysis results available yet.</div>';
        newsResultsContainer.innerHTML = '<div class="text-gray-500 dark:text-gray-400 p-4">No analysis results available yet.</div>';
    }

    // --- Initialization and Event Listeners ---

    /**
     * Requests the initial authentication state from the background script.
     */
    async function requestInitialAuthState() {
        console.log("Sidepanel: Requesting initial auth state from background...");
        try {
            const authState = await chrome.runtime.sendMessage({ action: "getAuthState" });
            console.log("Sidepanel: Received initial auth state:", authState);
            if (authState) {
                isSignedIn = authState.isSignedIn;
                currentUserProfile = authState.profile;
                updateAuthStateUI(); // Update UI with initial state
                // If signed in, load results
                if (isSignedIn) {
                    loadResultsForCurrentTab();
                }
            } else {
                 console.warn("Sidepanel: Did not receive valid initial auth state from background.");
                 isSignedIn = false;
                 currentUserProfile = null;
                 updateAuthStateUI(); // Ensure UI shows signed-out state
            }
        } catch (error) {
            console.error("Sidepanel: Error requesting initial auth state:", error);
            isSignedIn = false;
            currentUserProfile = null;
            updateAuthStateUI();
            displayErrorState("Could not connect to extension background. Please reload.");
        }
    }

    // Add event listeners for auth buttons
    if (signInButton) {
        signInButton.addEventListener('click', handleSignInClick);
        console.log("Sidepanel: Sign-in button listener attached.");
    } else {
        console.error("Sidepanel: signInButton element not found, cannot attach listener.");
    }

    // Add listener to the user avatar for sign-out confirmation
    if (userAvatar) {
        userAvatar.addEventListener('click', () => {
            // Only show confirmation if the user is actually signed in
            if (isSignedIn) {
                if (confirm("Are you sure you want to sign out?")) {
                    handleSignOutClick(); // Proceed with sign out if confirmed
                }
            }
        });
        console.log("Sidepanel: User avatar sign-out confirmation listener attached.");
    } else {
        console.error("Sidepanel: userAvatar element not found, cannot attach listener.");
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Listen for auth state updates from background
        if (message.action === "authStateUpdated") {
            console.log("Sidepanel: Received authStateUpdated message:", message.data);
            const wasSignedIn = isSignedIn; // Store previous state
            isSignedIn = message.data.isSignedIn;
            currentUserProfile = message.data.profile;
            updateAuthStateUI(); // Update UI based on the new state

            // If the user just signed IN, trigger loading results
            if (isSignedIn && !wasSignedIn) {
                console.log("Sidepanel: User just signed in, loading results.");
                loadResultsForCurrentTab();
            }
            return; // No response needed
        }

        // Listen for analysis update notifications (if still needed for real-time updates)
        if ((message.action === "analysisComplete" || message.action === "mediaAnalysisItemComplete")) {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                const currentTab = tabs[0];
                if (currentTab && (!message.tabId || message.tabId === currentTab.id)) {
                    console.log(`Sidepanel: Received ${message.action} notification, reloading results if signed in.`);
                    if (isSignedIn) {
                        loadResultsForCurrentTab();
                    }
                }
            });
            return true; // Indicate async response potentially
        }
    });

    // Initialize theme and request initial authentication state
    Promise.all([
        initializeTheme(),
        requestInitialAuthState() // Request auth state after setting up theme
    ]).catch(e => {
        console.error("Sidepanel: Error during initialization:", e);
        displayErrorState("Failed to initialize the sidepanel.");
    });

    document.getElementById("analyzeVideoButton").addEventListener("click", async () => {
        const videoInput = document.getElementById("videoUpload");
        const resultContainer = document.getElementById("videoAnalysisResult");
        const outputContainer = document.getElementById("videoAnalysisOutput");

        if (!videoInput.files.length) {
            alert("Please upload a video file first.");
            return;
        }

        const videoFile = videoInput.files[0];
        const formData = new FormData();
        formData.append("video", videoFile);

        try {
            // Show loading state
            resultContainer.classList.remove("hidden");
            outputContainer.textContent = "Analyzing video...";

            // Send video to backend
            const response = await fetch("http://localhost:5009/analyze-video", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error("Failed to analyze video.");
            }

            // Process plain text response
            const resultText = await response.text();

            // Display result
            outputContainer.textContent = resultText;
        } catch (error) {
            outputContainer.textContent = `Error: ${error.message}`;
        }
    });

});