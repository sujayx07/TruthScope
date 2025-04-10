# TruthScope Backend Documentation

## Overview
The backend server for TruthScope is built using Flask and provides API endpoints for analyzing text credibility and retrieving news articles. It leverages natural language processing models to detect potential fake news and integrates with external fact-checking APIs to provide comprehensive analysis.

---

## Setup and Configuration

### Environment Variables
The backend requires the following environment variables to be set:
- `GOOGLE_FACT_CHECK_API_KEY`: API key for Google's Fact Check Tools API
- `NEWS_API_KEY`: API key for News API integration

### Dependencies
Main dependencies include:
- Flask: Web framework for the API
- Flask-CORS: Handles Cross-Origin Resource Sharing
- Transformers: Hugging Face's library for NLP models
- NewsApiClient: Client for the News API
- Requests: HTTP library for API calls

## Core Components

### Model Initialization
```python
classifier = pipeline("text-classification", model="jy46604790/Fake-News-Bert-Detect")
```
- Loads a pre-trained BERT model specialized for fake news detection
- Initialized at server startup to avoid loading delays during requests

### News API Client
```python
newsapi = NewsApiClient(api_key=NEWS_API_KEY)
```
- Provides an interface to the News API service
- Used to fetch recent and relevant news articles

---

## API Endpoints

### 1. `/check` (POST)
Analyzes text for credibility and performs fact-checking.

#### Request
- Method: `POST`
- Content-Type: `application/json`
- Body:
  ```json
  {
    "text": "Text to analyze for credibility"
  }
  ```

#### Response
```json
{
  "label": "LABEL_0", // LABEL_0 = credible, LABEL_1 = potential fake news
  "score": 0.9876, // Confidence score (0-1)
  "fact_check": [
    {
      "title": "Claim text",
      "source": "Fact-check source name",
      "url": "URL to fact-check article"
    }
  ]
}
```

#### Function Details
```python
@app.route("/check", methods=["POST"])
def check():
```
- Receives text input from the extension
- Validates input (requires minimum 10 characters)
- Limits input to 1000 characters for processing efficiency
- Runs the text through the BERT classifier model
- Calls the `fact_check()` function to retrieve fact-checking information
- Returns combined results with labels, confidence scores, and fact-check data
- Includes error handling for invalid inputs and processing failures

### 2. `/news` (GET)
Retrieves news articles related to a query and performs fact-checking on article titles.

#### Request
- Method: `GET`
- Query Parameters:
  - `query`: Search term (default: "news")
  - `category`: News category (default: "general")

#### Response
```json
{
  "news": [
    {
      "title": "Article title",
      "source": "News source name",
      "url": "URL to article",
      "fact_check": [
        {
          "title": "Claim text",
          "source": "Fact-check source name",
          "url": "URL to fact-check article"
        }
      ]
    }
  ]
}
```

#### Function Details
```python
@app.route("/news", methods=["GET"])
def get_news():
```
- Accepts search query and optional category parameters
- Sanitizes and limits query length for security
- Calls News API to fetch top headlines matching criteria
- Limited to 5 articles for performance
- Performs fact-checking on each article title
- Returns structured response with article details and fact-check results
- Includes error handling for API failures

---

## Utility Functions

### 1. `fact_check(query)`
Performs fact-checking on a given text using Google's Fact Check Tools API.

#### Parameters
- `query`: Text to check against fact-checking sources

#### Returns
- Array of fact-check results, each containing:
  - `title`: The fact-checked claim
  - `source`: Name of the fact-checking organization
  - `url`: Link to the detailed fact-check article

#### Function Details
```python
def fact_check(query):
```
- Limits query to 500 characters to comply with API constraints
- Calls Google's Fact Check Tools API with the query
- Retrieves up to 3 most relevant fact-checks
- Formats results into a consistent structure
- Includes error handling for API request failures
- Returns a formatted list of fact-checks or an error message

### 2. `sanitize_query(query)`
Prepares a query string for safe use in API requests.

#### Parameters
- `query`: Raw query string from user input

#### Returns
- URL-encoded and length-limited query string

#### Function Details
```python
def sanitize_query(query):
```
- Strips whitespace from input
- Limits query to 500 characters
- URL-encodes the string using `quote_plus` to ensure safe transmission
- Prevents injection attacks and malformed requests

---

## Error Handling

The backend implements comprehensive error handling:

1. **Environment Validation**
   - Checks for required API keys at startup
   - Raises clear error messages if configuration is incomplete

2. **Model Loading**
   - Handles exceptions during model initialization
   - Provides informative error messages about model loading failures

3. **Request Validation**
   - Verifies input data meets minimum requirements
   - Returns 400 status code with descriptive messages for invalid inputs

4. **API Error Handling**
   - Catches exceptions during external API calls
   - Returns structured error responses with appropriate HTTP status codes
   - Includes error details for debugging while maintaining security

5. **Response Limits**
   - Imposes size limits on inputs and outputs for performance and security
   - Ensures predictable response sizes and processing times

---

## Security Considerations

1. **Input Sanitization**
   - All user inputs are sanitized before use in external API calls
   - Query length limits prevent excessive resource usage

2. **CORS Configuration**
   - Enabled via Flask-CORS to allow communication with the browser extension
   - Restricts cross-origin requests to legitimate extension sources

3. **API Key Protection**
   - Keys stored in environment variables, not in code
   - Loaded via dotenv for development convenience and security

4. **Response Limiting**
   - Results limited to reasonable sizes to prevent abuse
   - Prevents information overload and excessive data transfer

---

## Performance Optimization

1. **Model Preloading**
   - NLP model loaded once at startup, not per request
   - Significantly reduces response time for text analysis

2. **Result Pagination**
   - News API results limited to 5 articles per request
   - Fact-check results limited to 3 claims per query
   - Balances information quality with performance

3. **Input Size Limitations**
   - Analysis text limited to 1000 characters
   - Search queries limited to 500 characters
   - Prevents resource-intensive processing of large inputs

---

## Deployment Considerations

The server is configured to run on all network interfaces (`0.0.0.0`) on port `5000`:

```python
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
```

This configuration:
- Makes the server accessible from the local network
- Allows for containerization and deployment in various environments
- Works seamlessly with the Chrome extension's expected connection point

For production deployment, consider:
- Using a production WSGI server (e.g., Gunicorn)
- Implementing rate limiting
- Adding authentication for the API endpoints
- Setting up HTTPS with a proper certificate