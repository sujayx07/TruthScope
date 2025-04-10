# Content Script Documentation

## Overview

The content.js file is a content script for the TruthScope browser extension. Content scripts run in the context of web pages and can interact with the DOM. This script is responsible for extracting and analyzing text content from web pages, detecting user text selections, and communicating with the extension's background script.

## Core Functionality

### Communication Utilities

- **ensureBackgroundScriptReady()**: Ensures the background script is ready to receive messages before attempting communication
- **safeSendMessage()**: Safely sends messages to the background script with error handling
- **safeStorageSet()**: Safely stores data in the extension's local storage with error handling

### Text Selection Handling

The script monitors user text selections on the page:
- Tracks the last selected text to avoid duplicate processing
- Captures selections via mouseup and keyup events
- Filters selections to ensure they contain at least 4 words

### Article Content Extraction

- **extractArticleContent()**: Identifies and extracts the main content from a webpage
  - Uses a prioritized list of selectors to find article content (article, [role="article"], etc.)
  - Falls back to the document body if no article elements are found
  - Cleans and normalizes the text content

### Content Analysis

- **analyzeContent()**: Sends webpage content to the background script for analysis
  - Prevents concurrent analysis requests
  - Stores analysis results in local storage along with metadata (URL, timestamp)
  - Includes error handling and logging

### Page Type Detection

- **isArticlePage()**: Determines if the current page is likely an article
  - Excludes media files, search pages, login pages, etc.
  - Uses regex patterns to filter out non-article URLs

### Initialization

- **init()**: Main initialization function that runs when the script loads
  - Checks if the current page is an article
  - Waits for page to load completely before extracting and analyzing content
  - Only analyzes content exceeding a minimum length (100 characters)

### Message Handling

Listens for messages from other extension components (popup, background):
- **getSelectedText**: Returns the currently selected text on the page
- **analyzeContent**: Triggers content extraction and analysis on demand

## Background Communication

- Implements a keep-alive mechanism to maintain connection with the background script
- Pings the background script every 10 seconds to prevent disconnections

## Error Handling

The script implements comprehensive error handling:
- All asynchronous operations use try/catch blocks
- Errors are logged to the console
- Failed operations don't crash the extension