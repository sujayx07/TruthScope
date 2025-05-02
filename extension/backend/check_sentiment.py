import os
import time
import random
import logging
import json
import traceback
from functools import wraps
from typing import Dict, Any, Optional

import psycopg2
import psycopg2.pool
import requests
import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from dotenv import load_dotenv
from flask import Flask, request, jsonify, g
from flask_cors import CORS

# --- Google Auth ---
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# --- Gemini ---
import google.generativeai as genai


# --- Load Environment Variables ---
load_dotenv()
logging.critical("--- check_sentiment.py script started ---")

# --- Configuration ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "news_analysis_db")
DB_USER = os.getenv("DB_USER", "user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_POOL_MIN_CONN = 1
DB_POOL_MAX_CONN = 5
USERS_TABLE = "users"
DEFAULT_USER_TIER = "free"
API_TIMEOUT_SECONDS = 20

# --- Logging Setup ---
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(module)s:%(lineno)d - %(message)s')
logging.info("Logging configured with level DEBUG.")

# --- Custom Exceptions ---
class ConfigurationError(Exception): pass
class DatabaseError(Exception): pass
class AuthenticationError(Exception): pass

# --- Flask App Setup ---
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True, methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "Authorization", "Accept"])
logging.info("Flask app created and CORS configured for sentiment service.")

# --- Database Pool ---
db_pool = None

def initialize_db_pool():
    global db_pool
    if db_pool is not None:
        logging.debug("Database pool already initialized.")
        return
    logging.info(f"Initializing database connection pool for {DB_NAME}@{DB_HOST}:{DB_PORT}...")
    try:
        db_pool = psycopg2.pool.SimpleConnectionPool(
            DB_POOL_MIN_CONN, DB_POOL_MAX_CONN,
            host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
            user=DB_USER, password=DB_PASSWORD
        )
        conn = db_pool.getconn()
        logging.info(f"Database connection pool test successful (PostgreSQL version: {conn.server_version}).")
        db_pool.putconn(conn)
        logging.info("Database connection pool initialized successfully.")
    except (psycopg2.OperationalError, psycopg2.Error) as e:
        logging.error(f"FATAL: Error initializing database connection pool: {e}", exc_info=True)
        db_pool = None
        raise DatabaseError(f"Failed to initialize database pool: {e}")
    except Exception as e:
        logging.error(f"FATAL: Unexpected error initializing database pool: {e}", exc_info=True)
        db_pool = None
        raise DatabaseError(f"Unexpected error initializing database pool: {e}")

def get_db_connection():
    if db_pool is None:
        logging.error("Attempted to get DB connection, but pool is not initialized.")
        try:
            initialize_db_pool()
        except DatabaseError:
             logging.error("Re-initialization of DB pool failed.")
             raise DatabaseError("Database pool is not available and initialization failed.")
        if db_pool is None:
             raise DatabaseError("Database pool is not available.")
    try:
        logging.debug("Attempting to get connection from pool...")
        conn = db_pool.getconn()
        logging.debug(f"Successfully got connection from pool (ID: {id(conn)}).")
        return conn
    except Exception as e:
        logging.error(f"Error getting connection from pool: {e}", exc_info=True)
        raise DatabaseError(f"Failed to get connection from pool: {e}")

def release_db_connection(conn):
    if db_pool and conn:
        conn_id = id(conn)
        try:
            logging.debug(f"Releasing connection (ID: {conn_id}) back to pool.")
            db_pool.putconn(conn)
            logging.debug(f"Connection (ID: {conn_id}) released successfully.")
        except Exception as e:
            logging.error(f"Error releasing connection (ID: {conn_id}) to pool: {e}", exc_info=True)
            try:
                logging.warning(f"Attempting manual close for connection (ID: {conn_id}).")
                conn.close()
            except Exception as close_err:
                logging.error(f"Failed to manually close connection (ID: {conn_id}): {close_err}")

def close_db_pool():
    global db_pool
    if db_pool:
        logging.info("Closing all database connections in the pool.")
        try:
            db_pool.closeall()
            logging.info("Database connection pool closed.")
        except Exception as e:
            logging.error(f"Error closing database pool: {e}", exc_info=True)
        finally:
            db_pool = None

# --- Configuration Check ---
def check_configuration():
    logging.info("Checking sentiment backend configuration...")
    required_vars = {
        "DB_HOST": DB_HOST, "DB_PORT": DB_PORT, "DB_NAME": DB_NAME,
        "DB_USER": DB_USER, "DB_PASSWORD": DB_PASSWORD,
        "GOOGLE_CLIENT_ID": GOOGLE_CLIENT_ID,
        "GEMINI_API_KEY": GEMINI_API_KEY,
    }
    missing_vars = [name for name, value in required_vars.items() if not value or str(value).startswith("YOUR_")]
    if missing_vars:
        error_msg = f"Missing or placeholder required configuration variables: {', '.join(missing_vars)}"
        logging.critical(error_msg)
        raise ConfigurationError(error_msg)

    logging.info("Sentiment backend configuration check passed.")
    initialize_db_pool()
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        logging.info("Gemini API configured successfully.")
    except Exception as e:
        logging.error(f"Failed to configure Gemini API: {e}")

# --- Authentication Functions ---
def verify_google_access_token(access_token: str) -> Dict[str, Any]:
    logging.debug("Verifying Google access token...")
    userinfo_url = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json'
    try:
        response = requests.get(
            userinfo_url,
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=API_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        user_info = response.json()
        if not user_info or 'id' not in user_info:
            raise AuthenticationError("Invalid user info received from Google.")
        user_info['sub'] = user_info.get('id')
        logging.info(f"Access token verified successfully for user sub: {user_info.get('sub')}")
        return user_info
    except requests.exceptions.Timeout:
        logging.error("Timeout calling Google UserInfo endpoint.")
        raise AuthenticationError("Timeout during token verification.")
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code
        logging.warning(f"Google UserInfo request failed with status {status_code}. Token likely invalid or expired.")
        raise AuthenticationError(f"Token verification failed (HTTP {status_code}).")
    except requests.exceptions.RequestException as e:
        logging.error(f"Network error calling Google UserInfo endpoint: {e}")
        raise AuthenticationError("Network error during token verification.")
    except json.JSONDecodeError as e:
        logging.error(f"Failed to decode Google UserInfo response: {e}")
        raise AuthenticationError("Invalid response from token verification endpoint.")
    except Exception as e:
        logging.error(f"Unexpected error during token verification: {e}", exc_info=True)
        raise AuthenticationError(f"Unexpected error during token verification: {e}")

def get_or_create_user(google_id: str, email: Optional[str] = None) -> Dict[str, Any]:
    logging.debug(f"get_or_create_user: Attempting lookup/creation for google_id: '{google_id}', email: '{email}'")
    if not google_id:
        logging.error("get_or_create_user: Received empty or None google_id.")
        raise AuthenticationError("Google User ID cannot be empty.")

    conn = None
    try:
        conn = get_db_connection()
        logging.debug(f"get_or_create_user: Acquired DB connection for google_id: {google_id}")
        with conn.cursor() as cursor:
            logging.debug(f"get_or_create_user: Executing SELECT for google_id: {google_id}")
            cursor.execute(f"SELECT id, tier FROM {USERS_TABLE} WHERE google_id = %s", (google_id,))
            user_record = cursor.fetchone()

            if user_record:
                user_id, tier = user_record
                logging.info(f"get_or_create_user: Found existing user (ID: {user_id}, Tier: {tier}) for google_id: {google_id}")
                return {"id": user_id, "tier": tier, "google_id": google_id, "email": email}
            else:
                logging.info(f"get_or_create_user: No existing user found. Creating new user for google_id: {google_id}")
                cursor.execute(
                    f"""INSERT INTO {USERS_TABLE} (google_id, email, tier, created_at)
                       VALUES (%s, %s, %s, NOW()) RETURNING id, tier;""",
                    (google_id, email, DEFAULT_USER_TIER)
                )
                new_user_record = cursor.fetchone()
                if new_user_record:
                    user_id, tier = new_user_record
                    logging.info(f"get_or_create_user: Created new user (ID: {user_id}, Tier: {tier}) for google_id: {google_id}")
                    conn.commit()
                    return {"id": user_id, "tier": tier, "google_id": google_id, "email": email}
                else:
                    logging.error(f"get_or_create_user: Failed to retrieve new user details after insertion for google_id: {google_id}")
                    conn.rollback()
                    raise DatabaseError("Failed to retrieve new user details after insertion.")

    except AuthenticationError as ae:
        logging.error(f"get_or_create_user: AuthenticationError for google_id '{google_id}': {ae}")
        raise ae
    except (psycopg2.Error, DatabaseError) as e:
        logging.error(f"get_or_create_user: Database error for google_id '{google_id}': {e}", exc_info=True)
        if conn: conn.rollback()
        raise DatabaseError(f"DB error accessing user data for google_id {google_id}: {e}")
    except Exception as e:
        logging.error(f"get_or_create_user: Unexpected error for google_id '{google_id}': {e}", exc_info=True)
        if conn: conn.rollback()
        raise DatabaseError(f"Unexpected error accessing user data for google_id {google_id}: {e}")
    finally:
        if conn:
            release_db_connection(conn)

# --- Authentication Decorator ---
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        endpoint = request.endpoint or "unknown_endpoint"
        logging.debug(f"@{endpoint}: require_auth decorator invoked.")

        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            logging.warning(f"@{endpoint}: Missing or invalid Authorization header.")
            return jsonify({"error": "Authorization header missing or invalid"}), 401

        access_token = auth_header.split('Bearer ')[1]
        if not access_token:
            logging.warning(f"@{endpoint}: Empty token in Authorization header.")
            return jsonify({"error": "Empty token provided"}), 401

        try:
            user_info = verify_google_access_token(access_token)
            google_id = user_info.get('sub')
            email = user_info.get('email')

            if not google_id:
                 raise AuthenticationError("Verified token info missing user ID ('sub').")

            logging.info(f"@{endpoint}: Token verified for Google ID: {google_id}")

            db_user = get_or_create_user(google_id=google_id, email=email)

            g.user = {
                "id": db_user.get('id'),
                "tier": db_user.get('tier'),
                "google_id": google_id,
                "email": email
            }
            logging.info(f"@{endpoint}: User authenticated successfully. DB User ID: {g.user['id']}, Google ID: {g.user['google_id']}, Tier: {g.user['tier']}")

            return f(*args, **kwargs)

        except AuthenticationError as auth_err:
            logging.warning(f"@{endpoint}: Authentication failed. Error: {auth_err}")
            return jsonify({"error": f"Authentication failed: {auth_err}"}), 401
        except DatabaseError as db_err:
            logging.error(f"@{endpoint}: Database error during user authentication/processing. Error: {db_err}", exc_info=True)
            return jsonify({"error": f"Server error during user authentication: {db_err}"}), 500
        except Exception as e:
             logging.error(f"@{endpoint}: Unexpected error during authentication/user processing. Error: {e}", exc_info=True)
             return jsonify({"error": "Unexpected server error during authentication"}), 500

    return decorated_function

# --- NLTK Setup ---
try:
    nltk.data.find('sentiment/vader_lexicon.zip')
except LookupError: # Corrected: Catch LookupError when resource is not found
    logging.info("VADER lexicon not found. Downloading...")
    try:
        nltk.download('vader_lexicon')
    except Exception as download_e: # Catch potential download errors
        logging.error(f"Failed to download VADER lexicon: {download_e}")

# --- Initialize Sentiment Analyzer ---
try:
    vader_analyzer = SentimentIntensityAnalyzer()
    logging.info("VADER Sentiment Analyzer initialized.")
except Exception as e:
    logging.error(f"Failed to initialize VADER Sentiment Analyzer: {e}")
    vader_analyzer = None

# --- Gemini Bias Detection ---
def get_bias_tags_with_gemini(content: str) -> Dict[str, Any]:
    if not GEMINI_API_KEY:
        logging.warning("GEMINI_API_KEY not set. Skipping bias detection.")
        return {"error": "Bias detection not configured."}
    if not content:
        return {"summary": "No content provided for bias analysis.", "indicators": []}

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-flash')

        prompt = f"""Analyze the following text for potential biases. Identify specific bias indicators (like political leaning, emotional language, sensationalism, factual inaccuracies, unsupported claims, specific framing, etc.) and provide a brief overall summary of the detected bias profile.

Text:
{content}

Respond ONLY with a JSON object containing two keys:
1.  `summary`: A brief (1-2 sentence) summary of the overall bias profile.
2.  `indicators`: A JSON array of strings, where each string is a specific bias indicator found (e.g., ["left-leaning", "emotional language", "omission of context"]). If no specific indicators are found, return an empty array.

Example Response:
{{
  "summary": "The text exhibits a strong right-leaning political bias, using emotionally charged language to criticize opposing views.",
  "indicators": ["right-leaning", "emotional language", "ad hominem"]
}}
"""

        logging.debug("Sending request to Gemini for bias analysis.")
        response = model.generate_content(prompt)
        logging.debug(f"Gemini raw response text: {response.text}")

        json_text = response.text.strip().removeprefix('```json').removesuffix('```').strip()

        bias_result = json.loads(json_text)

        if not isinstance(bias_result, dict) or 'summary' not in bias_result or 'indicators' not in bias_result or not isinstance(bias_result['indicators'], list):
             raise ValueError("Invalid JSON structure received from Gemini.")

        logging.info(f"Gemini bias analysis successful. Summary: {bias_result.get('summary')}")
        return bias_result

    except json.JSONDecodeError as e:
        logging.error(f"Failed to decode JSON response from Gemini: {e}. Response text: {response.text}")
        return {"error": "Failed to parse bias analysis response."}
    except ValueError as ve:
        logging.error(f"Invalid response structure from Gemini: {ve}. Response text: {response.text}")
        return {"error": "Invalid bias analysis response structure."}
    except Exception as e:
        logging.error(f"Error during Gemini bias analysis: {e}", exc_info=True)
        return {"error": f"Bias analysis failed: {str(e)}"}

# --- API Endpoint ---
@app.route('/analyze_sentiment_bias', methods=['POST', 'OPTIONS'])
def handle_sentiment_bias_request():
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*' , 
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    if request.method == 'POST':
        return analyze_sentiment_bias()

@require_auth
def analyze_sentiment_bias():
    start_time = time.time()
    user_id = g.user.get('id', 'Unknown')
    google_id = g.user.get('google_id', 'Unknown')

    if not request.is_json:
        logging.warning(f"User {user_id}/{google_id}: Request is not JSON")
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    text = data.get('text', '')

    if not text:
        logging.warning(f"User {user_id}/{google_id}: Received empty text for analysis.")
        return jsonify({"error": "No text provided"}), 400

    logging.info(f"User {user_id}/{google_id}: Analyzing sentiment/bias for text starting with: {text[:50]}...")

    sentiment_result = {}
    if not vader_analyzer:
         logging.error("VADER analyzer not available.")
         sentiment_result = {"error": "Sentiment analyzer not initialized"}
    else:
        try:
            vs = vader_analyzer.polarity_scores(text)
            sentiment_score = vs['compound']
            if sentiment_score >= 0.05:
                sentiment_label = "positive"
            elif sentiment_score <= -0.05:
                sentiment_label = "negative"
            else:
                sentiment_label = "neutral"

            sentiment_result = {
                "score": sentiment_score,
                "label": sentiment_label
            }
            logging.info(f"User {user_id}/{google_id}: VADER Sentiment result: {sentiment_result}")
        except Exception as e:
            logging.error(f"User {user_id}/{google_id}: Error during VADER sentiment analysis: {e}", exc_info=True)
            sentiment_result = {"error": f"Sentiment analysis failed: {str(e)}"}

    bias_result = get_bias_tags_with_gemini(text)
    logging.info(f"User {user_id}/{google_id}: Gemini Bias result: {bias_result}")

    analysis_duration = time.time() - start_time
    logging.info(f"User {user_id}/{google_id}: Sentiment/Bias analysis completed in {analysis_duration:.2f}s")

    final_result = {
        "sentiment": sentiment_result,
        "bias": bias_result
    }

    status_code = 200
    if sentiment_result.get("error") and bias_result.get("error"):
        status_code = 500
    elif sentiment_result.get("error") or bias_result.get("error"):
        pass

    return jsonify(final_result), status_code

# --- Health Check ---
@app.route('/health_sentiment', methods=['GET'])
def health_check():
    db_status = "Unknown"
    db_pool_status = "Not Initialized" if db_pool is None else "Initialized"
    try:
        if db_pool:
            conn = get_db_connection()
            release_db_connection(conn)
            db_status = "Connected"
        else:
            db_status = "Pool not initialized"
    except Exception as e:
        db_status = f"Connection Error: {e}"
        logging.warning(f"Health check DB connection failed: {e}")

    gemini_configured = bool(GEMINI_API_KEY)

    return jsonify({
        "status": "healthy",
        "vader_analyzer_available": vader_analyzer is not None,
        "gemini_configured": gemini_configured,
        "database_pool_status": db_pool_status,
        "database_connection_status": db_status
    })

# --- Teardown Context ---
@app.teardown_appcontext
def teardown_db(exception=None):
    user = g.pop('user', None)
    if user:
        logging.debug("Removed user from app context 'g'.")
    if exception:
         logging.error(f"App context teardown triggered by exception: {exception}", exc_info=True)

# --- Shutdown Hook ---
def shutdown_server():
    logging.info("Sentiment server shutting down...")
    close_db_pool()
    logging.info("Shutdown complete.")

# --- Main Execution ---
if __name__ == '__main__':
    try:
        check_configuration()
        logging.info("Configuration check passed, DB pool initialized, Gemini configured.")

        port = int(os.environ.get("SENTIMENT_PORT", 5002))
        debug_mode = os.environ.get("FLASK_DEBUG", "True").lower() == "true"

        logging.info(f"Starting Sentiment Flask app on host 0.0.0.0, port {port} with debug={debug_mode}")

        app.run(host='0.0.0.0', port=port, debug=debug_mode)

    except (ConfigurationError, DatabaseError) as e:
        logging.critical(f"CRITICAL STARTUP ERROR: {e}. Sentiment Flask app cannot start.", exc_info=True)
        exit(1)
    except Exception as e:
         logging.critical(f"CRITICAL UNHANDLED ERROR running Sentiment Flask app: {e}", exc_info=True)
         exit(1)
    finally:
        shutdown_server()
        logging.info("Sentiment analysis script finished.")
