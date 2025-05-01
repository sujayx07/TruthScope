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
from datetime import datetime
from typing import Optional, List, Dict, Any, Union # For improved type hinting
from flask import Flask, request, jsonify # Added Flask imports

# --- Load Environment Variables ---
load_dotenv() # Load variables from .env file if it exists

# --- Configuration & Constants ---
datetime = datetime.now()
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
USERS_TABLE = "users" # <-- NEW TABLE NAME
DEFAULT_USER_TIER = "free" # <-- NEW DEFAULT TIER
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

def get_or_create_user(google_id: str) -> Dict[str, Any]:
    """
    Retrieves user details (id, tier) from the database based on Google ID.
    If the user doesn't exist, creates a new user with the default tier.

    Args:
        google_id: The user's unique Google ID ('sub').

    Returns:
        A dictionary containing the user's internal ID and tier.

    Raises:
        DatabaseError: If database operations fail.
        ValueError: If google_id is empty.
    """
    logging.debug(f"Getting or creating user for google_id: {google_id}")
    if not google_id: # Add check for missing ID
        logging.error("Attempted to get/create user with empty google_id.")
        raise ValueError("Google User ID cannot be empty.")
    conn = None
    try:
        conn = get_db_connection()
        with conn, conn.cursor() as cursor:
            cursor.execute(f"SELECT id, tier FROM {USERS_TABLE} WHERE google_id = %s", (google_id,))
            user_record = cursor.fetchone()

            if user_record:
                user_id, tier = user_record
                logging.info(f"Found existing user (ID: {user_id}, Tier: {tier}) for google_id: {google_id}")
                return {"id": user_id, "tier": tier}
            else:
                # If creating, email might be desirable but not strictly required if google_id is unique
                logging.info(f"Creating new user for google_id: {google_id}")
                cursor.execute(
                    f"""
                    INSERT INTO {USERS_TABLE} (google_id, email, tier, created_at)
                    VALUES (%s, %s, %s, NOW())
                    RETURNING id, tier;
                    """,
                    # Pass None for email if not available/required by DB schema
                    (google_id, None, DEFAULT_USER_TIER)
                )
                new_user_record = cursor.fetchone()
                if new_user_record:
                    user_id, tier = new_user_record
                    logging.info(f"Created new user (ID: {user_id}, Tier: {tier})")
                    return {"id": user_id, "tier": tier}
                else:
                    raise DatabaseError("Failed to retrieve new user details after insertion.")
    except (psycopg2.Error, DatabaseError, ValueError) as e: # Added ValueError
        logging.error(f"Database error getting/creating user for google_id {google_id}: {e}")
        # Reraise as DatabaseError for consistent handling upstream, unless it was ValueError
        if isinstance(e, ValueError):
            raise e
        raise DatabaseError(f"DB error accessing user data: {e}")
    finally:
        if conn:
            release_db_connection(conn)

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
    claims_to_check = claims[:FACT_CHECK_CLAIM_LIMIT]
    tool_errors = []

    for claim_text in claims_to_check:
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
             tool_errors.append(err_msg)
         except requests.exceptions.RequestException as e:
             err_msg = f"Error calling Google Fact Check API: {e}"
             logging.error(err_msg)
             tool_errors.append(err_msg)
         except json.JSONDecodeError as e:
             err_msg = f"Error decoding Google Fact Check API response: {e}"
             logging.error(err_msg)
             tool_errors.append(err_msg)
         except Exception as e:
             err_msg = f"Unexpected error during fact check for claim '{truncated_claim}': {e}"
             logging.error(err_msg)
             tool_errors.append(err_msg)

    if tool_errors:
        combined_error_msg = f"Fact check tool encountered errors: {'; '.join(tool_errors)}"
        logging.error(combined_error_msg)
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
            cursor.execute(
                f"""
                INSERT INTO {ANALYSIS_RESULTS_TABLE} (url, result_json, timestamp)
                VALUES (%s, %s, NOW())
                ON CONFLICT (url) DO UPDATE SET
                    result_json = EXCLUDED.result_json,
                    timestamp = NOW();
                """,
                (url, json.dumps(analysis_result))
            )
            logging.info(f"Analysis result saved/updated for URL: {url}")
    except (psycopg2.Error, DatabaseError) as e:
        logging.error(f"Database error updating analysis results for '{url}': {e}")
        raise DatabaseError(f"DB error updating results: {e}")
    except json.JSONDecodeError as e:
         logging.error(f"Error encoding analysis result to JSON for URL '{url}': {e}")
         raise DatabaseError(f"Failed to serialize result to JSON: {e}")
    finally:
        if conn:
            release_db_connection(conn)


# --- Gemini Client Setup ---

try:
    check_configuration() # Check config and initialize DB pool
    if GOOGLE_API_KEY:
        client = genai.Client(api_key=GOOGLE_API_KEY)
        logging.info("Gemini client initialized.")
    else:
        raise ConfigurationError("Google API Key is missing after configuration check.")

    agent_tools = [
        check_database_for_url,
        search_google_news,
        fact_check_claims,
    ]

    system_instruction = '''You are an AI agent specialized in detecting and classifying online news articles as credible or misleading. You will be given:

    url: a string containing the article's URL

    text: the full text of the article
    
    Today's date is {datetime}.

    Your job is to decide whether the article is likely real or fake, support your determination with evidence, and output only the following JSON object (no additional text):

    {
      "textResult": {
        "label": "LABEL_1" or "LABEL_0",
        "score": float,
        "highlights": ["string"],
        "reasoning": ["string"], // User-friendly summary of findings
        "fact_check": [
          {
            "source": "string",
            "title": "string",
            "url": "string",
            "claim": "string"
          }
          // ...merged results from both tools
        ]
      }
    }
    - LABEL_0 = likely real/credible
    - LABEL_1 = likely fake/misleading

    Process & Edge-Case Rules:

    Domain Verdict

    Call check_database_for_url(url).

    If it returns "invalid_url", set label="LABEL_1", score=0.0, highlights=[], reasoning=["The provided URL was invalid or could not be processed."], fact_check=[], and return.

    If it returns "VERDICT_REAL" or "VERDICT_FAKE", note this internally and use it to inform the final reasoning.

    If "VERDICT_NOT_FOUND" and the domain is non-news (e.g. github.com, any code-hosting or documentation site, npmjs.com, readthedocs.io, etc.), immediately set label="LABEL_0", score=0.5, highlights=[], reasoning=["The domain does not appear to be a news source and is considered out of scope."], fact_check=[], and return.

    Extract Key Claims

    Parse the article text and identify factual assertions (ignore code snippets, menu items, navigation text, README headers, image captions, metadata).

    Select up to {FACT_CHECK_CLAIM_LIMIT} central or suspicious claims.

    News Corroboration

    Call search_google_news(query) using the article title or main entities.

    Filter results by domain whitelist (major news publishers, reputable outlets). Discard links to GitHub, personal blogs, Medium, docs sites, white-papers, forums. Note internally if corroboration is found or lacking.

    If no valid news results remain, do not include "example.com" or placeholders; simply omit search results.

    Fact-Check Specific Claims

    For each selected claim, call fact_check_claims(claim).

    If the API errors (timeout, rate-limit), note this internally: "Fact check failed: <error message>". This may influence the score and reasoning but should not appear verbatim in the final reasoning unless it's the *only* finding.

    Collect any returned fact-checks.

    Satire Detection

    If the article originates from a known satire site or uses overt humor/parody indicators, note this internally: "Identified as satire". This should strongly influence the reasoning.

    Misinformation vs Disinformation

    When labeling LABEL_1, the reasoning should reflect whether evidence suggests unintentional misinformation or likely intentional disinformation (e.g. based on sensational phrasing, known agenda, source reputation).

    Scoring & Label

    Use a confidence score [0.0-1.0].

    Base it on the internal notes from database verdict, corroboration, fact-checks, and satire/disinfo signals.

    Highlights

    Include only the exact text snippets (quotations) from the article that are clearly unsupported or disputed by your fact-checks or lack of corroboration.

    Do not highlight code, readme headers, menu items, captions, or boilerplate.

    Reasoning Field (User-Facing Summary)

    Populate the `reasoning` array with clear, concise, user-friendly sentences summarizing the key findings.
    - Do NOT include internal process notes like "Database verdict: NOT_FOUND; domain is news -> proceeded".
    - Instead, synthesize the findings. For example: "The source's credibility could not be verified in our database.", "No supporting articles were found from reputable news outlets.", "Key claims in the article were contradicted by fact-checking organizations." or "The article appears to be satirical in nature."
    - If a tool failed (e.g., fact-check timeout), you might include a general statement like "Some fact-checking attempts were unsuccessful." if it impacts the conclusion, but avoid raw error messages.

    Merge Tool Results

    The fact_check array must combine:

    All successful fact_check_claims entries, each mapped to {source,title,url,claim:review_rating_or_claim}.

    All filtered search_google_news results, each as:

    {
      "source": "Google News Search",
      "title": "<result.title>",
      "url": "<result.link>",
      "claim": "<result.snippet>"
    }
    If both tools returned no valid entries, fact_check is [].

    Final JSON Only

    Do not output any explanatory text, markdown, or non-JSON tokens.

    All five fields under "textResult" must appear.

    Example of final output (for illustration only-do not emit this example):

    {
      "textResult": {
        "label":"LABEL_1",
        "score":0.82,
        "highlights":["\\"This vaccine contains microchips\\""],
        "reasoning":[
          "The source domain was not found in our credibility database.",
          "No corroborating reports were found from reputable news outlets.",
          "Fact-checking sources indicate the claim about vaccine microchips is false."
        ],
        "fact_check":[
          {
            "source":"BBC News",
            "title":"No Microchips in Vaccines",
            "url":"https://factcheck.example.org/article",
            "claim":"False" // Or the specific rating like "False"
          },
          {
            "source":"Google News Search",
            "title":"Health experts debunk microchip rumor",
            "url":"https://news.example.com/debunk",
            "claim":"Experts confirm vaccines do not contain microchips"
          }
          // ...additional results from both tools
        ]
      }
    }
    Strictly follow this template and rules for every article you analyze.
    Wait for all function calls to complete before returning the final JSON.
    Do not return partial results or intermediate states.
    If you encounter any errors, return an error message in the same format as above.
    Do not include any other text or explanations.
    '''


except ConfigurationError as e:
    logging.critical(f"Configuration failed: {e}")
except Exception as e:
    logging.critical(f"Failed to initialize Gemini client/model or DB pool: {e}")

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

        if hasattr(response, 'text'):
            final_text = response.text
            logging.info("Received final text response from Gemini after function calls.")
            try:
                if final_text.startswith("```json"):
                    final_text = final_text.strip().removeprefix("```json").removesuffix("```").strip()
                elif final_text.startswith("```"):
                     final_text = final_text.strip().removeprefix("```").removesuffix("```").strip()

                analysis_result = json.loads(final_text)
                logging.info(f"Analysis successful for URL: {url}")
                try:
                    update_analysis_results(url, analysis_result)
                except DatabaseError as db_err:
                    logging.error(f"Failed to store analysis result in DB: {db_err}")
                return analysis_result
            except json.JSONDecodeError as e:
                logging.error(f"Error decoding final model JSON response: {e}")
                logging.error(f"Raw final model response text: {final_text}")
                return {"error": "Model did not return valid JSON in the final response.", "raw_response": final_text}
        else:
            logging.error("Final response from Gemini did not contain text.")
            if hasattr(response, 'prompt_feedback'):
                 logging.error(f"Prompt Feedback: {response.prompt_feedback}")
            if hasattr(response, 'candidates') and response.candidates:
                 logging.error(f"Finish Reason: {getattr(response.candidates[0], 'finish_reason', 'N/A')}")
                 logging.error(f"Safety Ratings: {getattr(response.candidates[0], 'safety_ratings', 'N/A')}")

            return {"error": "Model did not provide a final text analysis after function calls."}

    except (ApiError, DatabaseError, ConfigurationError) as known_err:
         logging.error(f"A tool function failed during analysis for URL '{url}': {known_err}")
         return {"error": f"Analysis failed due to tool error: {known_err}"}
    except Exception as e:
        logging.critical(f"An unexpected error occurred during Gemini interaction for URL '{url}': {e}")
        logging.critical(traceback.format_exc())
        return {"error": f"An unexpected server error occurred during analysis interaction."}


# --- Flask App Setup ---
app = Flask(__name__)

try:
    check_configuration()
except ConfigurationError as e:
    logging.critical(f"CRITICAL CONFIGURATION ERROR: {e}. Flask app might not function correctly.")

@app.route('/analyze', methods=['POST'])
def handle_analyze():
    """Flask endpoint to handle article analysis requests."""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({"error": "Authorization header missing or invalid"}), 401

    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    url = data.get('url')
    article_text = data.get('article_text')
    google_user_id = data.get('google_user_id') # Get user ID from payload

    if not url or not article_text:
        return jsonify({"error": "Missing 'url' or 'article_text' in JSON payload"}), 400

    if not google_user_id: # Check if user ID is present
         logging.warning("Request received without google_user_id in payload.")
         return jsonify({"error": "Missing 'google_user_id' in JSON payload"}), 401 # Treat as unauthorized

    try:
        # Get user info from DB using the provided ID
        db_user = get_or_create_user(google_user_id)
        logging.info(f"Request authorized for user ID: {db_user['id']} (Tier: {db_user['tier']}) via provided google_user_id")

    except (ValueError, DatabaseError) as user_err: # Catch errors from get_or_create_user
        logging.error(f"User lookup/creation failed for google_user_id {google_user_id}: {user_err}")
        # Return 401 if ID was invalid, 500 for DB errors
        status_code = 401 if isinstance(user_err, ValueError) else 500
        return jsonify({"error": f"User lookup/creation failed: {user_err}"}), status_code
    except Exception as e:
        logging.error(f"Unexpected error during user processing for {google_user_id}: {e}")
        return jsonify({"error": "An unexpected error occurred during user processing"}), 500

    # --- Proceed with analysis ---
    result = analyze_article(url, article_text)

    status_code = 500 if "error" in result else 200
    if "error" in result and "Agent configuration failed" in result["error"]:
        status_code = 503

    return jsonify(result), status_code

@app.route('/')
def index():
    client_status = "Initialized" if client else "Not Initialized (Check Logs)"
    db_status = "Pool Available" if db_pool else "Pool Not Available (Check Logs)"
    return jsonify({
        "message": "TruthScope Analysis Backend",
        "client_status": client_status,
        "database_status": db_status
    })


if __name__ == "__main__":
    logging.info("Starting Flask development server...")
    app.run(host='0.0.0.0', port=5000, debug=True)
    logging.info("Flask server stopping...")
    close_db_pool()
    logging.info("Script finished.")