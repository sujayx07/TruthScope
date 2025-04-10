# Background Script Documentation

The background script (`background.js`) serves as the central orchestrator for the TruthScope browser extension. It handles communication between different components of the extension, processes text analysis requests, fetches news data, and manages the extension's state.

## Global Variables

- **`activeConnections`**: A Set that keeps track of all active port connections to the background script.
- **`isProcessing`**: A boolean flag that prevents multiple simultaneous text analysis requests.

## Connection Management

### `chrome.runtime.onConnect` Event Listener

```javascript
chrome.runtime.onConnect.addListener((port) => {
  activeConnections.add(port);
  
  // Handle keep-alive connections
  if (port.name === "keepAlive") {
    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        console.log('Keep-alive port disconnected');
      }
    });
  }
  
  port.onDisconnect.addListener(() => {
    activeConnections.delete(port);
  });
});
```

This listener manages port connections to the background script:

- Adds new connections to the `activeConnections` Set
- Handles "keepAlive" connections specifically, which are used to prevent the background script from being unloaded
- Removes connections from the Set when they are disconnected

## Message Handling

### `chrome.runtime.onMessage` Event Listener

This is the main message handler for the extension, processing various types of messages:

#### 1. Ping Message Handler

```javascript
if (message.action === "ping") {
  sendResponse({ status: "ready" });
  return true;
}
```

- **Purpose**: Provides a simple way for other extension components to check if the background script is active
- **Return**: Returns `{ status: "ready" }` to indicate the background script is functioning

#### 2. Text Analysis Handler

```javascript
if (message.action === "analyzeText" && !isProcessing) {
  // Implementation details...
  return true;
}
```

- **Purpose**: Processes requests to analyze text for credibility
- **Process**:
  1. Sets `isProcessing` flag to prevent multiple simultaneous requests
  2. Limits input text to 1000 characters
  3. Sends a POST request to the local backend at `http://127.0.0.1:5000/check`
  4. Processes the response and sends results back to the requester
  5. Creates a browser notification with the analysis result
  6. Broadcasts the result to all open tabs
  7. Handles errors gracefully with appropriate notifications
  8. Resets the `isProcessing` flag when complete

#### 3. News API Handler

```javascript
if (message.action === "getNews") {
  // Implementation details...
  return true;
}
```

- **Purpose**: Fetches news articles related to a query
- **Process**:
  1. Encodes the search query and constructs a URL to the local backend's news endpoint
  2. Sends a GET request to `http://127.0.0.1:5000/news`
  3. Processes the response and sends results back to the requester
  4. Handles empty results and errors appropriately

#### 4. Text Selection Handler

```javascript
if (message.action === "textSelected") {
  console.log("👆 Text selected in content script:", message.data);
  return false;
}
```

- **Purpose**: Logs when text is selected in the content script
- **Note**: This is currently a passive handler that only logs the selected text without taking further action

## API Communication

The background script communicates with a local backend server (running on port 5000) through two main endpoints:

1. **`/check` Endpoint**:
   - Method: POST
   - Purpose: Analyzes text for credibility/fake news detection
   - Request format: JSON with a `text` property
   - Response: JSON with analysis results including `label`, `score`, and possibly `fact_check` data

2. **`/news` Endpoint**:
   - Method: GET
   - Purpose: Retrieves news articles related to a query
   - Parameters: `query` (search term) and `category` (news category)
   - Response: JSON with an array of news articles

## Notification System

The background script uses Chrome's notification API to display analysis results:

```javascript
chrome.notifications.create({
  type: "basic",
  iconUrl: "icon16.png",
  title: isFakeNews ? "⚠️ Potential Fake News" : "✅ Credible Content",
  message: `Confidence: ${confidence}%`,
  contextMessage: factCheckSource
});
```

- Shows different icons and titles based on the credibility assessment
- Displays the confidence percentage of the analysis
- Includes fact-checking source information when available

## Error Handling

The background script includes robust error handling:

- API request errors are caught and logged
- User-friendly error notifications are displayed
- The processing state is reset even when errors occur
- Inactive tab messaging errors are silently caught and ignored

## Communication Flow

1. **Extension UI → Background Script**: Requests for text analysis or news data
2. **Background Script → Backend Server**: Forwards requests to the appropriate endpoints
3. **Backend Server → Background Script**: Returns analysis results or news data
4. **Background Script → Extension UI**: Forwards results back to the requesting component
5. **Background Script → All Tabs**: Broadcasts analysis results to content scripts in all tabs

This communication flow enables TruthScope to function seamlessly across different browser contexts and provide real-time feedback on content credibility.