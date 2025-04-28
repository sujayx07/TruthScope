# TruthScope Extension Backend

This directory contains the Python Flask backend server for the TruthScope browser extension. It analyzes news articles for potential misinformation using the Gemini AI model and external APIs.

## How it Works

The core logic resides in `check_text.py`. The backend provides a single API endpoint (`/analyze`) that accepts a POST request with the URL and text content of a news article.

The analysis process involves:
1.  **Configuration Check:** Verifies that all necessary API keys and database credentials are set via environment variables.
2.  **Database Pool Initialization:** Sets up a connection pool for efficient PostgreSQL database access.
3.  **Gemini Agent Initialization:** Configures the Gemini generative model with specific instructions and tools for fact-checking.
4.  **API Request Handling:** The `/analyze` endpoint receives the article URL and text.
5.  **Agent Execution:** The Gemini agent is invoked with the article details. The agent uses the following tools:
    *   `check_database_for_url`: Checks a predefined database (`url_verdicts` table) to see if the source domain has a known credibility verdict ('real' or 'fake').
    *   `search_google_news`: Uses the ZenRows API to search Google for recent news related to the article's topic, looking for corroborating or conflicting reports.
    *   `fact_check_claims`: Uses the Google Fact Check Tools API to verify specific claims extracted from the article text.
6.  **Result Synthesis:** The agent synthesizes the information from the tools and the article content to generate a final assessment.
7.  **Database Update:** The final analysis result (in JSON format) is stored in the `analysis_results` table.
8.  **Response:** The analysis result is returned as a JSON response to the client.

## Setup and Running

### Prerequisites

*   Python 3.x
*   PostgreSQL Database Server

### Installation

1.  **Clone the repository (if you haven't already):**
    ```bash
    git clone <repository_url>
    cd <repository_directory>/extension/backend
    ```
2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    # On Windows
    .\venv\Scripts\activate
    # On macOS/Linux
    source venv/bin/activate
    ```
3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
    The required packages are:
    *   `python-dotenv`: For loading environment variables from `.env`.
    *   `google-generativeai`: Google Gemini API client.
    *   `psycopg2-binary`: PostgreSQL adapter for Python.
    *   `requests`: For making HTTP requests to external APIs.
    *   `Flask`: Micro web framework for the server.

### Database Setup

1.  Ensure your PostgreSQL server is running.
2.  Create a database (e.g., `news_analysis_db`) and a user with privileges on that database.
3.  Connect to the database and run the SQL commands in `db.sql` to create the necessary tables:
    *   `url_verdicts`: Stores predefined verdicts for news source domains.
    *   `analysis_results`: Stores the JSON results of article analyses.

    **Table Schemas:**
    ```sql
    -- Stores known verdicts for domains
    CREATE TABLE url_verdicts (
        domain VARCHAR(255) PRIMARY KEY, -- e.g., 'example.com'
        verdict VARCHAR(10) NOT NULL CHECK (verdict IN ('real', 'fake'))
    );

    -- Stores the results of analyses
    CREATE TABLE analysis_results (
        url TEXT PRIMARY KEY, -- The full URL of the analyzed article
        result_json JSONB NOT NULL, -- The JSON output from the Gemini agent
        timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL -- When the analysis was performed
    );
    ```
    *Note: You might want to populate the `url_verdicts` table with known reliable and unreliable sources.*

### Environment Variables

Create a `.env` file in the `extension/backend` directory and add the following variables with your actual credentials:

```dotenv
# API Keys
GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY
GOOGLE_FACT_CHECK_API_KEY=YOUR_GOOGLE_FACT_CHECK_API_KEY
ZENROWS_API_KEY=YOUR_ZENROWS_API_KEY
# NEWS_API_KEY=YOUR_NEWS_API_KEY # Currently unused but defined

# Database Credentials
DB_HOST=localhost # Or your DB host
DB_PORT=5432      # Or your DB port
DB_NAME=news_analysis_db # Your database name
DB_USER=your_db_user     # Your database user
DB_PASSWORD=your_db_password # Your database password
```

Replace `YOUR_...` placeholders with your actual keys and credentials.

### Running the Server

1.  Make sure your virtual environment is activated and you are in the `extension/backend` directory.
2.  Run the Flask development server:
    ```bash
    python check_text.py
    ```
    The server will start, typically on `http://127.0.0.1:5000/` or `http://0.0.0.0:5000/`. Check the console output for the exact address.

    *For production deployments, use a production-grade WSGI server like Gunicorn or Waitress instead of the Flask development server.*

## API Endpoint

### `POST /analyze`

Analyzes a given news article.

*   **Request Body:** JSON object
    ```json
    {
      "url": "string", // The URL of the article to analyze
      "article_text": "string" // The full text content of the article
    }
    ```
*   **Success Response (200 OK):** JSON object containing the analysis result. The structure is defined by the Gemini agent's system prompt (see `check_text.py`).
    ```json
    {
      "textResult": {
        "label": "LABEL_1" or "LABEL_0", // LABEL_1: likely fake/misleading, LABEL_0: likely real/credible
        "score": float, // Confidence score (0.0 to 1.0)
        "highlights": ["string"], // List of questionable text snippets
        "reasoning": ["string"], // List of reasons for the label, citing evidence/errors
        "fact_check": [ // Combined results from Google News search and Fact Check API
          {
            "source": "string", // Source of the fact check or search result
            "title": "string", // Title of the fact check or search result
            "url": "string", // URL of the fact check or search result
            "claim": "string" // Claim checked or description
          }
        ]
      }
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: If the request body is not JSON or missing `url` or `article_text`.
    *   `500 Internal Server Error`: If an unexpected error occurs during analysis (e.g., API failure, database error).
    *   `503 Service Unavailable`: If the backend configuration failed (e.g., missing API keys).
    ```json
    {
      "error": "string" // Description of the error
    }
    ```

## Health Check

A basic health check endpoint is available at the root URL (`/`).

*   **GET /**
*   **Response:**
    ```json
    {
        "message": "TruthScope Analysis Backend",
        "model_status": "Initialized" or "Not Initialized (Check Logs)",
        "database_status": "Pool Available" or "Pool Not Available (Check Logs)"
    }
    ```
