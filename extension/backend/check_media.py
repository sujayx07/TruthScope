import logging
import os
import json
import traceback
from functools import wraps
from typing import Dict, Any, Optional

import psycopg2
import psycopg2.pool
import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify, g
from flask_cors import CORS

# --- Google Auth ---
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# --- Load Environment Variables ---
load_dotenv()
logging.critical("--- check_media.py script started ---")

# --- Configuration ---
SIGHTENGINE_API_USER = os.getenv('SIGHTENGINE_API_USER')
SIGHTENGINE_API_SECRET = os.getenv('SIGHTENGINE_API_SECRET')
OCR_SPACE_API_KEY = os.getenv('OCR_SPACE_API_KEY')
SIGHTENGINE_API_URL = 'https://api.sightengine.com/1.0/check.json'
SIGHTENGINE_VIDEO_API_URL = 'https://api.sightengine.com/1.0/video/check-sync.json'
OCR_SPACE_API_URL = 'https://api.ocr.space/parse/imageurl'
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

AI_AUDIO_API_KEY = os.getenv('AI_AUDIO_API_KEY')
AI_AUDIO_API_URL = os.getenv('AI_AUDIO_API_URL')

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "news_analysis_db")
DB_USER = os.getenv("DB_USER", "user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_POOL_MIN_CONN = 1
DB_POOL_MAX_CONN = 5
USERS_TABLE = "users"
DEFAULT_USER_TIER = "free"
PAID_TIER = "paid"
API_TIMEOUT_SECONDS = 20

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(module)s:%(lineno)d - %(message)s')
logging.info("Logging configured with level DEBUG.")

class ConfigurationError(Exception): pass
class DatabaseError(Exception): pass
class ApiError(Exception): pass
class AuthenticationError(Exception): pass
class AuthorizationError(Exception): pass

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True, methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "Authorization", "Accept"])
logging.info("Flask app created and CORS configured.")

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

def check_configuration():
    logging.info("Checking media backend configuration...")
    required_vars = {
        "SIGHTENGINE_API_USER": SIGHTENGINE_API_USER,
        "SIGHTENGINE_API_SECRET": SIGHTENGINE_API_SECRET,
        "OCR_SPACE_API_KEY": OCR_SPACE_API_KEY,
        "DB_HOST": DB_HOST, "DB_PORT": DB_PORT, "DB_NAME": DB_NAME,
        "DB_USER": DB_USER, "DB_PASSWORD": DB_PASSWORD,
        "GOOGLE_CLIENT_ID": GOOGLE_CLIENT_ID,
    }
    missing_vars = [name for name, value in required_vars.items() if not value or str(value).startswith("YOUR_")]
    if missing_vars:
        error_msg = f"Missing or placeholder required configuration variables: {', '.join(missing_vars)}"
        logging.critical(error_msg)
        raise ConfigurationError(error_msg)

    optional_vars = {
        "AI_AUDIO_API_KEY": AI_AUDIO_API_KEY,
        "AI_AUDIO_API_URL": AI_AUDIO_API_URL,
    }
    missing_optional = [name for name, value in optional_vars.items() if not value or str(value).startswith("YOUR_")]
    if missing_optional:
        logging.warning(f"Optional configuration variables missing or placeholders: {', '.join(missing_optional)}. Audio analysis may fail.")

    logging.info("Media backend configuration check passed.")
    initialize_db_pool()

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
                return {"id": user_id, "tier": tier}
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
                    return {"id": user_id, "tier": tier}
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

def require_auth_and_paid_tier(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        endpoint = request.endpoint or "unknown_endpoint"
        logging.debug(f"@{endpoint}: require_auth_and_paid_tier decorator invoked.")

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
            logging.info(f"@{endpoint}: User authenticated successfully. DB User ID: {g.user['id']}, Tier: {g.user['tier']}")

        except AuthenticationError as auth_err:
            logging.warning(f"@{endpoint}: Authentication failed (token verification or user lookup). Error: {auth_err}")
            return jsonify({"error": f"Authentication failed: {auth_err}"}), 401
        except DatabaseError as db_err:
            logging.error(f"@{endpoint}: Database error during user authentication/processing. Error: {db_err}", exc_info=True)
            return jsonify({"error": f"Server error during user authentication: {db_err}"}), 500
        except Exception as e:
             logging.error(f"@{endpoint}: Unexpected error during authentication/user processing. Error: {e}", exc_info=True)
             return jsonify({"error": "Unexpected server error during authentication"}), 500

        user_tier = g.user.get('tier')
        if user_tier != PAID_TIER:
            logging.warning(f"@{endpoint}: Authorization failed. User {g.user['id']} (Tier: {user_tier}) does not have required tier '{PAID_TIER}'. Access denied.")
            return jsonify({"error": f"Access denied. This feature requires a '{PAID_TIER}' subscription."}), 403

        logging.info(f"@{endpoint}: Authorization successful. User {g.user['id']} has required tier '{PAID_TIER}'.")

        logging.debug(f"@{endpoint}: Authentication & Authorization successful, proceeding to route function.")
        return f(*args, **kwargs)

    return decorated_function

# --- API Client Functions ---
def call_sightengine_api(image_url: str) -> Dict[str, Any]:
    """Calls the Sightengine API to check an image for various properties."""
    logging.debug(f"Calling Sightengine API for image URL: {image_url}")
    if not SIGHTENGINE_API_USER or not SIGHTENGINE_API_SECRET:
        logging.error("Sightengine API credentials are not configured.")
        raise ConfigurationError("Sightengine API credentials missing.")

    params = {
        'url': image_url,
        'models': 'nudity-2.0,wad,offensive,gore,celebrities,scam,fake,ai-generated', # Added ai-generated
        'api_user': SIGHTENGINE_API_USER,
        'api_secret': SIGHTENGINE_API_SECRET
    }
    try:
        response = requests.get(SIGHTENGINE_API_URL, params=params, timeout=API_TIMEOUT_SECONDS)
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        result = response.json()
        logging.debug(f"Sightengine API response status: {result.get('status')}")
        if result.get('status') == 'failure':
            logging.warning(f"Sightengine API call failed: {result.get('error')}")
            # Return the error structure for consistent handling
            return {"status": "error", "error": result.get('error', {}).get('message', 'Unknown Sightengine API error')}
        return result
    except requests.exceptions.Timeout:
        logging.error(f"Timeout calling Sightengine API for {image_url}")
        raise ApiError("Timeout calling Sightengine API.")
    except requests.exceptions.HTTPError as e:
        logging.error(f"HTTP error calling Sightengine API for {image_url}: {e.response.status_code} - {e.response.text}")
        raise ApiError(f"Sightengine API returned HTTP error: {e.response.status_code}")
    except requests.exceptions.RequestException as e:
        logging.error(f"Network error calling Sightengine API for {image_url}: {e}")
        raise ApiError(f"Network error calling Sightengine API: {e}")
    except json.JSONDecodeError as e:
        logging.error(f"Failed to decode Sightengine API response for {image_url}: {e}")
        raise ApiError("Invalid JSON response from Sightengine API.")
    except Exception as e:
        logging.error(f"Unexpected error calling Sightengine API for {image_url}: {e}", exc_info=True)
        raise ApiError(f"Unexpected error during Sightengine API call: {e}")

def call_ocr_space_api(image_url: str) -> Dict[str, Any]:
    """Calls the OCR Space API to extract text from an image."""
    logging.debug(f"Calling OCR Space API for image URL: {image_url}")
    if not OCR_SPACE_API_KEY:
        logging.error("OCR Space API key is not configured.")
        raise ConfigurationError("OCR Space API key missing.")

    payload = {
        'url': image_url,
        'apikey': OCR_SPACE_API_KEY,
        'language': 'eng', # Or detect automatically if needed
        'isOverlayRequired': False
    }
    try:
        response = requests.post(OCR_SPACE_API_URL, data=payload, timeout=API_TIMEOUT_SECONDS)
        response.raise_for_status()
        result = response.json()
        logging.debug(f"OCR Space API response: {result}")

        if result.get('IsErroredOnProcessing'):
            error_message = result.get('ErrorMessage', ['Unknown OCR error'])[0]
            logging.warning(f"OCR Space API processing error for {image_url}: {error_message}")
            return {"status": "error", "error": error_message, "text": None}

        if 'ParsedResults' in result and result['ParsedResults']:
            parsed_text = result['ParsedResults'][0].get('ParsedText', '').strip()
            logging.info(f"OCR Space extracted text (length: {len(parsed_text)}) for {image_url}")
            return {"status": "success", "text": parsed_text, "error": None}
        else:
            logging.warning(f"OCR Space API returned no parsed results for {image_url}")
            return {"status": "success", "text": None, "error": "No text found"} # No text found isn't strictly an error

    except requests.exceptions.Timeout:
        logging.error(f"Timeout calling OCR Space API for {image_url}")
        raise ApiError("Timeout calling OCR Space API.")
    except requests.exceptions.HTTPError as e:
        logging.error(f"HTTP error calling OCR Space API for {image_url}: {e.response.status_code} - {e.response.text}")
        raise ApiError(f"OCR Space API returned HTTP error: {e.response.status_code}")
    except requests.exceptions.RequestException as e:
        logging.error(f"Network error calling OCR Space API for {image_url}: {e}")
        raise ApiError(f"Network error calling OCR Space API: {e}")
    except json.JSONDecodeError as e:
        logging.error(f"Failed to decode OCR Space API response for {image_url}: {e}")
        raise ApiError("Invalid JSON response from OCR Space API.")
    except Exception as e:
        logging.error(f"Unexpected error calling OCR Space API for {image_url}: {e}", exc_info=True)
        raise ApiError(f"Unexpected error during OCR Space API call: {e}")

def call_sightengine_video_api(video_url: str) -> Dict[str, Any]:
    pass # Placeholder for existing code

def call_ai_audio_api(audio_url: str) -> Dict[str, Any]:
    pass # Placeholder for existing code

# --- Analysis Logic ---
def analyze_image_logic(image_url: str) -> Dict[str, Any]:
    """Analyzes an image using Sightengine and OCR Space APIs."""
    logging.info(f"Starting image analysis logic for URL: {image_url}")
    sightengine_results = None
    ocr_results = None
    errors = []
    analysis_summary = "Analysis incomplete due to errors." # Default summary

    # Call Sightengine
    try:
        sightengine_results = call_sightengine_api(image_url)
        if sightengine_results.get('status') == 'error':
            errors.append(f"Sightengine Error: {sightengine_results.get('error', 'Unknown')}")
            sightengine_results = None # Don't include partial error structure in final result
    except (ApiError, ConfigurationError) as e:
        logging.error(f"Error calling Sightengine for {image_url}: {e}")
        errors.append(f"Sightengine API call failed: {e}")
    except Exception as e:
        logging.error(f"Unexpected error during Sightengine call for {image_url}: {e}", exc_info=True)
        errors.append(f"Unexpected server error during Sightengine analysis: {e}")

    # Call OCR Space
    try:
        ocr_results = call_ocr_space_api(image_url)
        if ocr_results.get('status') == 'error':
            errors.append(f"OCR Error: {ocr_results.get('error', 'Unknown')}")
            ocr_results = None # Don't include partial error structure
    except (ApiError, ConfigurationError) as e:
        logging.error(f"Error calling OCR Space for {image_url}: {e}")
        errors.append(f"OCR Space API call failed: {e}")
    except Exception as e:
        logging.error(f"Unexpected error during OCR Space call for {image_url}: {e}", exc_info=True)
        errors.append(f"Unexpected server error during OCR analysis: {e}")

    # --- Generate Summary and Final Result ---
    final_status = "success" if not errors else "partial_success" if sightengine_results or ocr_results else "error"

    summary_parts = []
    if sightengine_results:
        ai_prob = sightengine_results.get('ai_generated', {}).get('prob', 0) * 100
        fake_prob = sightengine_results.get('fake', {}).get('prob', 0) * 100
        summary_parts.append(f"AI Gen: {ai_prob:.1f}%")
        summary_parts.append(f"Deepfake: {fake_prob:.1f}%")
        # Add other relevant Sightengine flags if needed
    else:
         summary_parts.append("Sightengine: Failed")

    if ocr_results and ocr_results.get('text') is not None:
        text_length = len(ocr_results['text'])
        summary_parts.append(f"OCR Text: {text_length} chars")
    elif ocr_results and ocr_results.get('text') is None and ocr_results.get('error') == "No text found":
         summary_parts.append("OCR Text: None found")
    else: # OCR failed or errored
        summary_parts.append("OCR: Failed")

    if errors:
        summary_parts.append(f"Errors: {len(errors)}")
        analysis_summary = f"Analysis completed with issues. {' | '.join(summary_parts)}"
    elif final_status == "success":
        analysis_summary = f"Analysis successful. {' | '.join(summary_parts)}"
    else: # Should not happen if logic is correct, but as a fallback
        analysis_summary = f"Analysis status uncertain. {' | '.join(summary_parts)}"

    logging.info(f"Image analysis summary for {image_url}: {analysis_summary}")

    return {
        "status": final_status,
        "analysis_summary": analysis_summary,
        "sightengine_results": sightengine_results if sightengine_results else {}, # Return empty dict if failed
        "ocr_text": ocr_results.get('text') if ocr_results else None, # Return None if failed or no text
        "errors": errors
    }

def analyze_video_logic(video_url: str) -> Dict[str, Any]:
    pass # Placeholder for existing code

def analyze_audio_logic(audio_url: str) -> Dict[str, Any]:
    pass # Placeholder for existing code

# --- Flask Endpoints ---

# Handle OPTIONS requests for CORS preflight
@app.route('/analyze_image', methods=['OPTIONS'])
@app.route('/analyze_video', methods=['OPTIONS'])
@app.route('/analyze_audio', methods=['OPTIONS'])
def handle_options():
    pass # Placeholder for existing code

@app.route('/analyze_image', methods=['POST'])
def handle_analyze_image():
    endpoint = request.endpoint

    data = request.get_json()
    if not data:
        logging.warning(f"@{endpoint}: Missing JSON payload.")
        return jsonify({"error": "Missing JSON payload"}), 400

    media_url = data.get('media_url')
    if not media_url:
        logging.warning(f"@{endpoint}: Missing 'media_url' in JSON payload.")
        return jsonify({"error": "Missing 'media_url' in JSON payload"}), 400

    logging.info(f"@{endpoint}: Processing image analysis for URL: {media_url}")

    try:
        result = analyze_image_logic(media_url)
        # Determine status code based on analysis outcome
        if result.get("status") == "error":
            status_code = 500 # Internal server error if the whole analysis failed
        elif result.get("status") == "partial_success":
            status_code = 207 # Multi-Status, indicates partial success
        else: # success
            status_code = 200

        logging.info(f"@{endpoint}: Analysis finished for {media_url}. Returning status {status_code}.")
        return jsonify(result), status_code
    except Exception as e: # Catch unexpected errors in the handler itself
        logging.error(f"@{endpoint}: Unexpected error in handle_analyze_image for {media_url}: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "error": "An unexpected server error occurred handling the image analysis request.",
            "analysis_summary": "Analysis failed due to unexpected server error."
            }), 500

@app.route('/analyze_video', methods=['POST'])
@require_auth_and_paid_tier
def handle_analyze_video():
    endpoint = request.endpoint

    data = request.get_json()
    if not data:
        logging.warning(f"@{endpoint}: Missing JSON payload.")
        return jsonify({"error": "Missing JSON payload"}), 400

    media_url = data.get('media_url')
    if not media_url:
        logging.warning(f"@{endpoint}: Missing 'media_url' in JSON payload.")
        return jsonify({"error": "Missing 'media_url' in JSON payload"}), 400

    logging.info(f"@{endpoint}: Processing video analysis for URL: {media_url} by User ID: {g.user.get('id')}")

    try:
        result = analyze_video_logic(media_url)
        status_code = 200
        if result.get("status") == "error" and "server error" in result.get("error", "").lower():
             status_code = 500

        logging.info(f"@{endpoint}: Video analysis finished for {media_url}. Returning HTTP status {status_code}.")
        return jsonify(result), status_code
    except Exception as e:
        logging.error(f"@{endpoint}: Unexpected error during video analysis logic execution for {media_url}: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "error": "An unexpected server error occurred during video analysis.",
            "analysis_summary": "Analysis failed due to unexpected server error."
            }), 500

@app.route('/analyze_audio', methods=['POST'])
@require_auth_and_paid_tier
def handle_analyze_audio():
    endpoint = request.endpoint

    data = request.get_json()
    if not data:
        logging.warning(f"@{endpoint}: Missing JSON payload.")
        return jsonify({"error": "Missing JSON payload"}), 400

    media_url = data.get('media_url')
    if not media_url:
        logging.warning(f"@{endpoint}: Missing 'media_url' in JSON payload.")
        return jsonify({"error": "Missing 'media_url' in JSON payload"}), 400

    logging.info(f"@{endpoint}: Processing audio analysis for URL: {media_url} by User ID: {g.user.get('id')}")

    try:
        result = analyze_audio_logic(media_url)
        status_code = 200
        if result.get("status") == "error" and "server error" in result.get("error", "").lower():
             status_code = 500
        elif result.get("status") == "skipped":
             pass

        logging.info(f"@{endpoint}: Audio analysis finished for {media_url}. Returning HTTP status {status_code}.")
        return jsonify(result), status_code
    except Exception as e:
        logging.error(f"@{endpoint}: Unexpected error during audio analysis logic execution for {media_url}: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "error": "An unexpected server error occurred during audio analysis.",
            "analysis_summary": "Analysis failed due to unexpected server error."
            }), 500

@app.route('/')
def index():
    logging.debug("Root path '/' accessed (health check).")
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

    return jsonify({
        "message": "TruthScope Media Analysis Backend",
        "status": "running",
        "database_pool_status": db_pool_status,
        "database_connection_status": db_status
    })

@app.teardown_appcontext
def teardown_db(exception=None):
    user = g.pop('user', None)
    if user:
        logging.debug("Removed user from app context 'g'.")
    if exception:
         logging.error(f"App context teardown triggered by exception: {exception}", exc_info=True)

def shutdown_server():
    logging.info("Server shutting down...")
    close_db_pool()
    logging.info("Shutdown complete.")

if __name__ == "__main__":
    try:
        check_configuration()
        logging.info("Configuration check passed and DB pool initialized.")

        port = int(os.environ.get("PORT", 3000))
        debug_mode = os.environ.get("FLASK_DEBUG", "True").lower() == "true"

        logging.info(f"Starting Flask app on host 0.0.0.0, port {port} with debug={debug_mode}")

        app.run(host='0.0.0.0', port=port, debug=debug_mode)

    except (ConfigurationError, DatabaseError) as e:
        logging.critical(f"CRITICAL STARTUP ERROR: {e}. Flask app cannot start.", exc_info=True)
        exit(1)
    except Exception as e:
         logging.critical(f"CRITICAL UNHANDLED ERROR running Flask app: {e}", exc_info=True)
         exit(1)
    finally:
        shutdown_server()
        logging.info("Media analysis script finished.")
