import os
import json
import requests
import psycopg2
import psycopg2.pool # For connection pooling
import logging
import traceback
from urllib.parse import urlparse, quote
from dotenv import load_dotenv # For .env file support
from google import genai
from google.genai import types
from typing import Optional, List, Dict, Any, Union # For improved type hinting
from flask import Flask, request, jsonify # Added Flask imports

# --- Load Environment Variables ---
load_dotenv() # Load variables from .env file if it exists

# --- Configuration & Constants ---

# Logging Setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# API Keys & Credentials (Loaded from environment)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GOOGLE_FACT_CHECK_API_KEY = os.getenv("GOOGLE_FACT_CHECK_API_KEY")
NEWS_API_KEY = os.getenv("NEWS_API_KEY") # Note: Currently unused in functions, but checked
ZENROWS_API_KEY = os.getenv("ZENROWS_API_KEY")

# Database Credentials (Loaded from environment)
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "news_analysis_db")
DB_USER = os.getenv("DB_USER", "user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")

# Database Constants
DB_POOL_MIN_CONN = 1
DB_POOL_MAX_CONN = 5
URL_VERDICTS_TABLE = "url_verdicts"
ANALYSIS_RESULTS_TABLE = "analysis_results"
VERDICT_REAL = "real"
VERDICT_FAKE = "fake"
VERDICT_NOT_FOUND = "not_found"

# API Constants
ZENROWS_BASE_URL = 'https://serp.api.zenrows.com/v1/targets/google/search/'
FACT_CHECK_API_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
API_TIMEOUT_SECONDS = 15 # Increased timeout slightly
FACT_CHECK_CLAIM_LIMIT = 3 # Max claims to check per article
FACT_CHECK_QUERY_SIZE_LIMIT = 500 # Max characters per claim query
GOOGLE_SEARCH_RESULT_LIMIT = 5

# Gemini Constants
GEMINI_MODEL_NAME = "gemini-1.5-flash-latest" # Or "gemini-1.5-pro-latest"
GEMINI_TEMPERATURE = 0.2

# --- Custom Exceptions ---
class ConfigurationError(Exception):
    """Custom exception for missing configuration."""
    pass

class DatabaseError(Exception):
    """Custom exception for database related errors."""
    pass

class ApiError(Exception):
    """Custom exception for external API errors."""
    pass

# --- Database Connection Pool ---
db_pool = None

def initialize_db_pool():
    """Initializes the PostgreSQL connection pool."""
    global db_pool
    if db_pool is None:
        logging.info("Initializing database connection pool...")
        try:
            db_pool = psycopg2.pool.SimpleConnectionPool(
                DB_POOL_MIN_CONN,
                DB_POOL_MAX_CONN,
                host=DB_HOST,
                port=DB_PORT,
                dbname=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD
            )
            logging.info("Database connection pool initialized successfully.")
        except (psycopg2.OperationalError, psycopg2.Error) as e:
            logging.error(f"Error initializing database connection pool: {e}")
            db_pool = None # Ensure pool is None if init fails
            raise DatabaseError(f"Failed to initialize database pool: {e}")

def get_db_connection():
    """Gets a connection from the pool."""
    if db_pool is None:
        # Attempt to initialize if not already done (e.g., first call)
        initialize_db_pool()
        if db_pool is None: # Check again if initialization failed
             raise DatabaseError("Database pool is not available.")
    try:
        return db_pool.getconn()
    except Exception as e:
        logging.error(f"Error getting connection from pool: {e}")
        raise DatabaseError(f"Failed to get connection from pool: {e}")

def release_db_connection(conn):
    """Releases a connection back to the pool."""
    if db_pool and conn:
        try:
            db_pool.putconn(conn)
        except Exception as e:
            logging.error(f"Error releasing connection to pool: {e}")
            # Optionally destroy the connection if putting back fails
            try:
                conn.close()
            except Exception:
                pass


def close_db_pool():
    """Closes all connections in the pool."""
    global db_pool
    if db_pool:
        logging.info("Closing database connection pool.")
        db_pool.closeall()
        db_pool = None

# --- Configuration Check ---
def check_configuration():
    """Checks if all necessary environment variables are set."""
    logging.info("Checking configuration...")
    required_vars = {
        "GOOGLE_API_KEY": GOOGLE_API_KEY,
        "GOOGLE_FACT_CHECK_API_KEY": GOOGLE_FACT_CHECK_API_KEY,
        "ZENROWS_API_KEY": ZENROWS_API_KEY,
        "DB_HOST": DB_HOST,
        "DB_PORT": DB_PORT,
        "DB_NAME": DB_NAME,
        "DB_USER": DB_USER,
        "DB_PASSWORD": DB_PASSWORD,
    }
    missing_vars = [name for name, value in required_vars.items() if not value or value.startswith("YOUR_")]
    if missing_vars:
        raise ConfigurationError(f"Missing required configuration variables: {', '.join(missing_vars)}")
    logging.info("Configuration check passed.")
    # Initialize pool after config check passes
    initialize_db_pool()


# --- Helper Functions ---

def extract_domain_from_url(url: str) -> Optional[str]:
    """Extracts the domain name from a URL, removing 'www.'."""
    try:
        parsed_url = urlparse(url)
        domain = parsed_url.netloc
        if domain and domain.startswith('www.'):
            domain = domain[4:]
        return domain.lower() if domain else None
    except Exception as e:
        logging.warning(f"Error parsing URL '{url}': {e}")
        return None

# --- Agent Tool Functions ---

def check_database_for_url(url: str) -> str:
    """
    Checks if a URL's domain is in the credibility database.
    Connects to the PostgreSQL database via pool, extracts the domain from the URL,
    and queries the URL_VERDICTS_TABLE for a matching domain.
    Returns the verdict ('real', 'fake') or 'not_found'.
    Raises DatabaseError on connection or query issues.
    """
    logging.info(f"Tool Call: check_database_for_url(url='{url}')")
    domain = extract_domain_from_url(url)
    if not domain:
        logging.warning("Invalid URL or domain could not be extracted.")
        return "invalid_url" # Return specific string for invalid URL

    conn = None
    verdict = VERDICT_NOT_FOUND
    try:
        conn = get_db_connection()
        with conn, conn.cursor() as cursor: # Use context managers for connection and cursor
            cursor.execute(f"SELECT verdict FROM {URL_VERDICTS_TABLE} WHERE domain = %s", (domain,))
            result = cursor.fetchone()
            if result:
                verdict = result[0] # Should be VERDICT_REAL or VERDICT_FAKE
                logging.info(f"Verdict found for domain '{domain}': {verdict}")
            else:
                logging.info(f"No verdict found for domain '{domain}'.")
        return verdict
    except (psycopg2.Error, DatabaseError) as e:
        logging.error(f"Database error checking URL '{url}' (domain: {domain}): {e}")
        # Don't return error string, raise exception for agent/caller to handle
        raise DatabaseError(f"DB error checking URL: {e}")
    finally:
        if conn:
            release_db_connection(conn)


def search_google_news(query: str) -> List[Dict[str, str]]:
    """
    Searches Google for recent news related to the query using the ZenRows API.
    Returns a list of search result dictionaries (title, link, snippet).
    Raises ApiError on request or parsing issues.
    """
    logging.info(f"Tool Call: search_google_news(query='{query[:50]}...')")
    if not ZENROWS_API_KEY or ZENROWS_API_KEY.startswith("YOUR_"):
        raise ConfigurationError("ZenRows API Key not configured.")

    encoded_query = quote(query)
    api_url = f'{ZENROWS_BASE_URL}{encoded_query}'
    params = {'apikey': ZENROWS_API_KEY}

    try:
        response = requests.get(api_url, params=params, timeout=API_TIMEOUT_SECONDS)
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        data = response.json()

        results = []
        # Defensive parsing of ZenRows response
        raw_results = data.get('organic_results', [])
        if not isinstance(raw_results, list):
            logging.warning("ZenRows 'organic_results' is not a list.")
            raw_results = []

        for item in raw_results[:GOOGLE_SEARCH_RESULT_LIMIT]:
             if item and isinstance(item, dict):
                 results.append({
                     "title": str(item.get("title", "N/A")),
                     "link": str(item.get("url", "#")),
                     "snippet": str(item.get("description", "N/A"))
                 })
             else:
                 logging.warning(f"Skipping invalid item in ZenRows results: {item}")

        logging.info(f"Found {len(results)} Google news results for query.")
        return results
    except requests.exceptions.Timeout:
        logging.error(f"Timeout calling ZenRows API for query: {query}")
        raise ApiError(f"ZenRows API request timed out after {API_TIMEOUT_SECONDS}s.")
    except requests.exceptions.RequestException as e:
        logging.error(f"Error calling ZenRows API: {e}")
        raise ApiError(f"ZenRows API request failed: {e}")
    except json.JSONDecodeError as e:
        logging.error(f"Error decoding ZenRows API response: {e}")
        raise ApiError("Invalid JSON response from ZenRows API.")
    except Exception as e:
        logging.error(f"Unexpected error in search_google_news: {e}")
        raise ApiError(f"Unexpected error during Google search: {e}")


def fact_check_claims(claims: List[str]) -> List[Dict[str, str]]:
    """
    Performs fact checks on a list of claims using the Google Fact Check Tools API.
    Returns a list of fact-check result dictionaries.
    Raises ApiError or ConfigurationError.
    """
    logging.info(f"Tool Call: fact_check_claims({len(claims)} claims)")
    if not GOOGLE_FACT_CHECK_API_KEY or GOOGLE_FACT_CHECK_API_KEY.startswith("YOUR_"):
         raise ConfigurationError("Google Fact Check API Key not configured.")

    if not claims:
        return []

    all_results = []
    # Limit number of claims checked for performance and API usage reasons.
    claims_to_check = claims[:FACT_CHECK_CLAIM_LIMIT]
    tool_errors = [] # Keep track of errors encountered

    for claim_text in claims_to_check:
         # Limit query size due to potential API restrictions.
         truncated_claim = claim_text[:FACT_CHECK_QUERY_SIZE_LIMIT]
         logging.info(f"Checking claim: '{truncated_claim[:100]}...'")
         try:
             response = requests.get(
                 FACT_CHECK_API_URL,
                 params={"query": truncated_claim, "pageSize": 1, "languageCode": "en"},
                 headers={"X-Goog-Api-Key": GOOGLE_FACT_CHECK_API_KEY},
                 timeout=API_TIMEOUT_SECONDS
             )
             response.raise_for_status()
             data = response.json()
             found_claims_data = data.get("claims", [])

             if found_claims_data and isinstance(found_claims_data, list):
                 # Extract info from the first claimReview of the first claim found
                 first_claim_data = found_claims_data[0]
                 if first_claim_data and isinstance(first_claim_data, dict):
                     review_list = first_claim_data.get("claimReview", [])
                     if review_list and isinstance(review_list, list):
                         review = review_list[0]
                         if review and isinstance(review, dict):
                             publisher = review.get("publisher", {})
                             publisher_name = "Unknown Source"
                             if publisher and isinstance(publisher, dict):
                                 publisher_name = str(publisher.get("name", "Unknown Source"))

                             all_results.append({
                                 "source": publisher_name,
                                 "title": str(review.get("title", first_claim_data.get("text", "N/A"))),
                                 "url": str(review.get("url", "#")),
                                 "claim": str(first_claim_data.get("text", claim_text)), # Original or API's version
                                 "review_rating": str(review.get("textualRating", "N/A"))
                             })
         except requests.exceptions.Timeout:
             err_msg = f"Timeout calling Fact Check API for claim: {truncated_claim}"
             logging.error(err_msg)
             tool_errors.append(err_msg) # Record error
             # Continue to next claim, but record the failure
         except requests.exceptions.RequestException as e:
             err_msg = f"Error calling Google Fact Check API: {e}"
             logging.error(err_msg)
             tool_errors.append(err_msg) # Record error
             # Continue to next claim
         except json.JSONDecodeError as e:
             err_msg = f"Error decoding Google Fact Check API response: {e}"
             logging.error(err_msg)
             tool_errors.append(err_msg) # Record error
             # Continue to next claim
         except Exception as e:
             err_msg = f"Unexpected error during fact check for claim '{truncated_claim}': {e}"
             logging.error(err_msg)
             tool_errors.append(err_msg) # Record error
             # Continue to next claim

    # After checking all claims, if any errors occurred, raise a single ApiError
    # This informs the main loop that the tool execution was problematic.
    if tool_errors:
        combined_error_msg = f"Fact check tool encountered errors: {'; '.join(tool_errors)}"
        # Log the combined error as well
        logging.error(combined_error_msg)
        # Raise an error that the main analyze_article function can catch
        raise ApiError(combined_error_msg)

    logging.info(f"Found {len(all_results)} fact checks for {len(claims_to_check)} claims.")
    return all_results


def update_analysis_results(url: str, analysis_result: Dict[str, Any]) -> None:
    """
    Stores the final analysis result in the ANALYSIS_RESULTS_TABLE PostgreSQL table.
    Connects via pool and inserts/updates the result based on the URL.
    Raises DatabaseError on connection or query issues.
    """
    logging.info(f"DB Call: update_analysis_results(url='{url}')")
    conn = None
    try:
        conn = get_db_connection()
        with conn, conn.cursor() as cursor:
            # Use INSERT ... ON CONFLICT to handle updates if the URL already exists
            # Ensure result_json column is of type JSONB in PostgreSQL
            cursor.execute(
                f"""
                INSERT INTO {ANALYSIS_RESULTS_TABLE} (url, result_json, timestamp)
                VALUES (%s, %s, NOW())
                ON CONFLICT (url) DO UPDATE SET
                    result_json = EXCLUDED.result_json,
                    timestamp = NOW();
                """,
                (url, json.dumps(analysis_result)) # Store the result as a JSON string
            )
            # No explicit commit needed when using 'with conn:' - it commits on success
            logging.info(f"Analysis result saved/updated for URL: {url}")
    except (psycopg2.Error, DatabaseError) as e:
        logging.error(f"Database error updating analysis results for '{url}': {e}")
        # No explicit rollback needed with 'with conn:' - it rolls back on error
        raise DatabaseError(f"DB error updating results: {e}")
    except json.JSONDecodeError as e:
         logging.error(f"Error encoding analysis result to JSON for URL '{url}': {e}")
         raise DatabaseError(f"Failed to serialize result to JSON: {e}") # Treat as DB error contextually
    finally:
        if conn:
            release_db_connection(conn)


# --- Gemini Client Setup ---

try:
    check_configuration() # Check config and initialize DB pool
    if GOOGLE_API_KEY:
        # Initialize the client first
        client = genai.Client(api_key=GOOGLE_API_KEY)
        logging.info("Gemini client initialized.")
    else:
        raise ConfigurationError("Google API Key is missing after configuration check.")

    # Define the tools for the agent (using the actual functions)
    agent_tools = [
        check_database_for_url,
        search_google_news,
        fact_check_claims,
    ]

    # Define the system instruction for the agent
    system_instruction = f'''You are an AI agent designed to analyze news articles for potential misinformation.
    You will be given the URL and the text content of an article.
    Your goal is to determine if the article is likely 'real' or 'fake' and provide supporting evidence.

    Available Tools:
    - check_database_for_url: Check a trusted database for a verdict on the article's source domain ('{VERDICT_REAL}', '{VERDICT_FAKE}', '{VERDICT_NOT_FOUND}', 'invalid_url').
    - search_google_news: Search for recent related news articles on Google to check for corroboration or conflicting reports. Returns a list of results or raises an error.
    - fact_check_claims: Verify specific claims made in the article text using a fact-checking API. Returns a list of fact checks or raises an error.

    Process:
    1.  Use `check_database_for_url` to get the source domain verdict. Handle 'invalid_url'.
    2.  Analyze the input URL and text. Extract key claims or topics.
    3.  Use `search_google_news` with relevant queries (like the article title or key entities) to find related recent news. This tool returns a list of {{ "title": "...", "link": "...", "snippet": "..." }}.
    4.  Identify 1-{FACT_CHECK_CLAIM_LIMIT} key claims from the article text that seem questionable or central. Use `fact_check_claims` to check them. This tool returns a list of {{ "source": "...", "title": "...", "url": "...", "claim": "...", "review_rating": "..." }}.
    5.  Synthesize the information gathered from the tools and the article text.
    6.  Formulate a final assessment based on the evidence, including a confidence score (0.0 to 1.0) and a label ('LABEL_1' for likely fake/misleading, 'LABEL_0' for likely real/credible).
    7.  Highlight specific text snippets from the article that are questionable or unsupported.
    8.  Provide reasoning for the label decision, citing evidence from tools or text analysis.
    9.  **CRITICAL:** Merge results from BOTH `fact_check_claims` AND `search_google_news` into the `fact_check` field of the final output JSON. If `search_google_news` was called successfully and returned results, those results MUST be included in the `fact_check` array using the specified format.
    10. Write some highlights from the article text that are questionable or unsupported in the `highlights` field of the final output JSON.

    Output Format:
    ***IMPORTANT: Respond ONLY with a valid JSON object. Do NOT include any introductory text, explanations, apologies, or markdown formatting like ```json ... ``` around the JSON object.***
    The JSON object must have the following structure:
    {{ 
      "textResult": {{ 
        "label": "LABEL_1" or "LABEL_0", // LABEL_1 for likely fake/misleading, LABEL_0 for likely real/credible
        "score": float, // Confidence score (0.0 to 1.0) for the label
        "highlights": ["string"], // List of specific text snippets from the article itself that are questionable or unsupported
        "reasoning": ["string"], // List of reasons explaining the label decision, citing evidence from tools or text analysis. **If a tool call failed (raised an error), mention the tool name and the reason for failure here (e.g., "Fact check failed due to API timeout", "Database check failed: connection error").**
        "fact_check": [ // **MUST include merged results from BOTH fact_check_claims AND search_google_news.** If search_google_news succeeded, its results MUST be here. Empty list ONLY if BOTH tools failed or returned no results.
          // Structure for items from fact_check_claims:
          {{

            "source": "string", // From fact_check_claims result
            "title": "string", // From fact_check_claims result
            "url": "string", // From fact_check_claims result
            "claim": "string" // From fact_check_claims result (or review_rating if claim missing)
          }},
          // Structure for items from search_google_news:
          {{

            "source": "Google News Search", // Use this literal string
            "title": "string", // From search_google_news result's 'title'
            "url": "string", // From search_google_news result's 'link'
            "claim": "string" // From search_google_news result's 'snippet'
          }}
          // ... more items if applicable
        ]
      }}
    }}
    MAKE SURE THERE IS NO EXTRA TEXT OR MARKUP AROUND THE JSON RESPONSE OR SPACES.
    DO NOT MAKE UP ANY LINKS, LEAVE THEM BLANK IF NOT FOUND. OR GIVE THE REAL ONE
    Focus on providing clear reasoning based on the evidence found. In cases of missing or conflicting information, your decision is final.
    Make sure all the fields under "textResult" are present in the JSON response, even if some values are empty lists (e.g., if no highlights were found, "highlights": []). 
    If any tool fails, include the error message in the 'reasoning' field and do not include its results in 'fact_check'.Make up the results of the empty field yourself only if the tool fails, like the highlights.
    '''


except ConfigurationError as e:
    logging.critical(f"Configuration failed: {e}")
    # model remains None
except Exception as e:
    logging.critical(f"Failed to initialize Gemini client/model or DB pool: {e}")
    # model remains None

# --- Main Analysis Function ---

def analyze_article(url: str, article_text: str) -> Dict[str, Any]:
    """
    Analyzes a news article using the Gemini agent with function calling.

    Args:
        url: The URL of the article.
        article_text: The text content of the article.

    Returns:
        A dictionary containing the analysis results in the specified format,
        or an error dictionary if analysis cannot proceed.
    """
    logging.info(f"--- Analyzing Article --- URL: {url}")
    logging.debug(f"Text: {article_text[:200]}...")

    if not url or not article_text:
        return {"error": "URL and article text must be provided."}

    # Prepare the initial prompt for the model
    initial_prompt = f"Analyze the following article:\nURL: {url}\n\nText:\n{article_text}"

    try:
        chat = client.chats.create(
            model="gemini-2.0-flash",
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=agent_tools,
            ),
        )
        response = chat.send_message(
             [initial_prompt], 
        )

        # After the loop (handled by the SDK), the final response should be text
        if hasattr(response, 'text'):
            final_text = response.text
            logging.info("Received final text response from Gemini after function calls.")
            try:
                # Strip markdown fences if present
                if final_text.startswith("```json"):
                    final_text = final_text.strip().removeprefix("```json").removesuffix("```").strip()
                elif final_text.startswith("```"):
                     final_text = final_text.strip().removeprefix("```").removesuffix("```").strip()

                analysis_result = json.loads(final_text)
                logging.info(f"Analysis successful for URL: {url}")
                # Optional: Update DB
                try:
                    update_analysis_results(url, analysis_result)
                except DatabaseError as db_err:
                    logging.error(f"Failed to store analysis result in DB: {db_err}")
                return analysis_result
            except json.JSONDecodeError as e:
                logging.error(f"Error decoding final model JSON response: {e}")
                logging.error(f"Raw final model response text: {final_text}")
                # Include the raw text in the error for debugging
                return {"error": "Model did not return valid JSON in the final response.", "raw_response": final_text}
        else:
            # Handle cases where the response might not have text (e.g., blocked)
            logging.error("Final response from Gemini did not contain text.")
            # Log details if available
            if hasattr(response, 'prompt_feedback'):
                 logging.error(f"Prompt Feedback: {response.prompt_feedback}")
            if hasattr(response, 'candidates') and response.candidates:
                 logging.error(f"Finish Reason: {getattr(response.candidates[0], 'finish_reason', 'N/A')}")
                 logging.error(f"Safety Ratings: {getattr(response.candidates[0], 'safety_ratings', 'N/A')}")

            return {"error": "Model did not provide a final text analysis after function calls."}

    except (ApiError, DatabaseError, ConfigurationError) as known_err:
         # Errors raised by our tool functions during the SDK's automatic calling
         logging.error(f"A tool function failed during analysis for URL '{url}': {known_err}")
         return {"error": f"Analysis failed due to tool error: {known_err}"}
    except Exception as e:
        # Catch potential errors from chat.send_message or other unexpected issues
        logging.critical(f"An unexpected error occurred during Gemini interaction for URL '{url}': {e}")
        logging.critical(traceback.format_exc())
        return {"error": f"An unexpected server error occurred during analysis interaction."}


# --- Flask App Setup ---
app = Flask(__name__)

# Ensure configuration and DB pool are checked/initialized when the app starts
# Note: In production, consider more robust initialization (e.g., Flask app factory)
try:
    check_configuration()
except ConfigurationError as e:
    logging.critical(f"CRITICAL CONFIGURATION ERROR: {e}. Flask app might not function correctly.")
    # Decide if the app should fail to start entirely
    # raise e # Uncomment to prevent app start on config error

@app.route('/analyze', methods=['POST'])
def handle_analyze():
    """Flask endpoint to handle article analysis requests."""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    url = data.get('url')
    article_text = data.get('article_text')

    if not url or not article_text:
        return jsonify({"error": "Missing 'url' or 'article_text' in JSON payload"}), 400

    # Call the existing analysis function
    result = analyze_article(url, article_text)

    # Determine status code based on result
    status_code = 500 if "error" in result else 200
    # If specific errors occurred (like config), maybe return 503 Service Unavailable
    if "error" in result and "Agent configuration failed" in result["error"]:
        status_code = 503

    return jsonify(result), status_code

# Optional: Add a basic root endpoint for health check or info
@app.route('/')
def index():
    # Check if the client initialized correctly
    client_status = "Initialized" if client else "Not Initialized (Check Logs)" # Check client instead of model
    db_status = "Pool Available" if db_pool else "Pool Not Available (Check Logs)"
    return jsonify({
        "message": "TruthScope Analysis Backend",
        "client_status": client_status, # Use client_status
        "database_status": db_status
    })


# --- Server Execution & Cleanup ---
if __name__ == "__main__":
    # Note: Flask's development server is not recommended for production.
    # Use a production-ready WSGI server like Gunicorn or Waitress.
    logging.info("Starting Flask development server...")
    # Use host='0.0.0.0' to make it accessible on the network
    # Use debug=True for development (enables auto-reloading, detailed errors)
    # Set debug=False for production environments
    app.run(host='0.0.0.0', port=5000, debug=True)

    # Cleanup code (like closing DB pool) might need adjustment
    # depending on the WSGI server and deployment strategy.
    # For the dev server, this might run on Ctrl+C, but it's not guaranteed.
    # Consider using Flask's @app.teardown_appcontext for cleanup per request
    # or signal handling for graceful shutdown in production.
    logging.info("Flask server stopping...")
    close_db_pool() # Attempt cleanup
    logging.info("Script finished.")
