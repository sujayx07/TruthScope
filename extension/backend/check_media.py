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
    """Calls the Sightengine API to check an image for AI generation."""
    logging.debug(f"Calling Sightengine API for image URL: {image_url}")
    if not SIGHTENGINE_API_USER or not SIGHTENGINE_API_SECRET:
        logging.error("Sightengine API credentials are not configured.")
        return {"status": "error", "error": "Sightengine API credentials missing."}

    params = {
        'url': image_url,
        'models': 'genai',
        'api_user': SIGHTENGINE_API_USER,
        'api_secret': SIGHTENGINE_API_SECRET
    }
    try:
        response = requests.get(SIGHTENGINE_API_URL, params=params, timeout=API_TIMEOUT_SECONDS)
        response.raise_for_status()
        result = response.json()
        logging.debug(f"Sightengine API raw response: {result}")
        if result.get('status') == 'failure':
            error_detail = result.get('error', {}).get('message', 'Unknown Sightengine API error')
            logging.warning(f"Sightengine API call failed: {error_detail}")
            return {"status": "error", "error": error_detail}
        if 'status' not in result:
            result['status'] = 'success'
        return result
    except requests.exceptions.Timeout:
        logging.error(f"Timeout calling Sightengine API for {image_url}")
        return {"status": "error", "error": "Timeout calling Sightengine API."}
    except requests.exceptions.HTTPError as e:
        logging.error(f"HTTP error calling Sightengine API for {image_url}: {e.response.status_code} - {e.response.text}")
        return {"status": "error", "error": f"Sightengine API returned HTTP error: {e.response.status_code}"}
    except requests.exceptions.RequestException as e:
        logging.error(f"Network error calling Sightengine API for {image_url}: {e}")
        return {"status": "error", "error": f"Network error calling Sightengine API: {e}"}
    except json.JSONDecodeError as e:
        logging.error(f"Failed to decode Sightengine API response for {image_url}: {e}")
        return {"status": "error", "error": "Invalid JSON response from Sightengine API."}
    except Exception as e:
        logging.error(f"Unexpected error calling Sightengine API for {image_url}: {e}", exc_info=True)
        return {"status": "error", "error": f"Unexpected error during Sightengine API call: {e}"}

def call_ocr_space_api(image_url: str) -> Dict[str, Any]:
    logging.warning("call_ocr_space_api is deprecated and should not be called.")
    return {"status": "error", "error": "OCR functionality is disabled."}

def call_sightengine_video_api(video_url: str) -> Dict[str, Any]:
    pass

def call_ai_audio_api(audio_url: str) -> Dict[str, Any]:
    pass

# --- Analysis Logic ---
def analyze_image_logic(image_url: str) -> Dict[str, Any]:
    """Analyzes an image using Sightengine, returning a structured result compatible with the frontend."""
    logging.info(f"Starting image analysis for: {image_url}")

    sightengine_result = call_sightengine_api(image_url)

    ai_generated_prob = 0.0
    manipulation_confidence = 0.0
    manipulation_error = None
    final_status = "error"

    if sightengine_result.get("status") == "success":
        final_status = "success"
        ai_generated_prob = sightengine_result.get("type", {}).get("ai_generated", 0.0)
        manipulation_confidence = ai_generated_prob
        logging.debug(f"Sightengine analysis successful for {image_url}. AI prob: {ai_generated_prob:.4f}")
    else:
        manipulation_error = sightengine_result.get("error", "Unknown Sightengine error")
        logging.warning(f"Sightengine analysis failed for {image_url}: {manipulation_error}")

    manipulated_found = 1 if ai_generated_prob >= 0.5 else 0

    analysis_summary = ""
    if final_status == "success":
        detection_text = f"Detected as {'AI Generated' if manipulated_found else 'Likely Authentic'} (Confidence: {manipulation_confidence:.2f})."
        analysis_summary = detection_text + " No text extracted (OCR disabled)."
    else:
        analysis_summary = f"Analysis failed. Sightengine Error: {manipulation_error}"
        manipulated_found = 0
        manipulation_confidence = 0.0

    result = {
        "status": final_status,
        "images_analyzed": 1,
        "manipulated_images_found": manipulated_found,
        "manipulation_confidence": manipulation_confidence,
        "manipulated_media": [
            {
                "url": image_url,
                "type": "image",
                "parsed_text": None,
                "ai_generated": ai_generated_prob if final_status == "success" else None,
                "ocr_error": None,
                "manipulation_error": manipulation_error
            }
        ],
        "analysis_summary": analysis_summary
    }

    logging.info(f"Image analysis complete for {image_url}. Summary: {analysis_summary}")
    return result

def analyze_video_logic(video_url: str) -> Dict[str, Any]:
    pass

def analyze_audio_logic(audio_url: str) -> Dict[str, Any]:
    pass

# --- Flask Endpoints ---

@app.route('/analyze_image', methods=['OPTIONS'])
@app.route('/analyze_video', methods=['OPTIONS'])
@app.route('/analyze_audio', methods=['OPTIONS'])
def handle_options():
    response = jsonify({'message': 'OPTIONS request successful'})
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response, 200

@app.route('/analyze_image', methods=['POST'])
@require_auth_and_paid_tier
def handle_analyze_image():
    endpoint = request.endpoint
    user_id = g.user.get('id', 'Unknown') if hasattr(g, 'user') else 'Unknown'
    user_tier = g.user.get('tier', 'Unknown') if hasattr(g, 'user') else 'Unknown'

    if not request.is_json:
        logging.warning(f"@{endpoint}: Request is not JSON")
        return jsonify({"error": "Request must be JSON", "analysis_summary": "Error: Invalid request format."}), 400

    data = request.get_json()
    media_url = data.get('media_url')

    if not media_url:
        logging.warning(f"@{endpoint}: Missing 'media_url' in JSON payload")
        return jsonify({"error": "Missing 'media_url' in JSON payload", "analysis_summary": "Error: Missing media URL."}), 400

    if not isinstance(media_url, str) or not (media_url.startswith('http://') or media_url.startswith('https://')):
        logging.warning(f"@{endpoint}: Invalid 'media_url' format: {media_url}")
        return jsonify({"error": "Invalid 'media_url' format", "analysis_summary": "Error: Invalid media URL format."}), 400

    logging.info(f"@{endpoint}: Processing image analysis for URL: {media_url} by User ID: {user_id} (Tier: {user_tier})")

    try:
        result = analyze_image_logic(media_url)

        http_status = 200 if result.get("status") == "success" else 500
        if result.get("status") == "error" and result.get("manipulated_media", [{}])[0].get("manipulation_error"):
            if "API returned HTTP error" in result["manipulated_media"][0]["manipulation_error"] or \
               "Timeout calling" in result["manipulated_media"][0]["manipulation_error"] or \
               "Network error calling" in result["manipulated_media"][0]["manipulation_error"]:
                http_status = 502

        logging.info(f"@{endpoint}: Analysis finished for {media_url}. Returning HTTP status {http_status}.")
        return jsonify(result), http_status

    except Exception as e:
        logging.exception(f"@{endpoint}: Unexpected error in handle_analyze_image for {media_url}: {e}")
        return jsonify({
            "status": "error",
            "images_analyzed": 0,
            "manipulated_images_found": 0,
            "manipulation_confidence": 0.0,
            "manipulated_media": [],
            "analysis_summary": "Error: Server failed unexpectedly during image analysis.",
            "error": "An unexpected server error occurred."
        }), 500

@app.route('/analyze_video', methods=['POST'])
@require_auth_and_paid_tier
def handle_analyze_video():
    endpoint = request.endpoint
    user_id = g.user.get('id', 'Unknown') if hasattr(g, 'user') else 'Unknown'
    data = request.get_json()
    media_url = data.get('media_url') if data else None

    if not media_url:
        logging.warning(f"@{endpoint}: Missing 'media_url' in JSON payload")
        return jsonify({"error": "Missing 'media_url' in JSON payload"}), 400

    logging.info(f"@{endpoint}: Processing video analysis for URL: {media_url} by User ID: {user_id}")

    result = {
        "status": "error",
        "videos_analyzed": 0,
        "manipulated_videos_found": 0,
        "manipulation_confidence": 0.0,
        "manipulated_media": [],
        "analysis_summary": "Video analysis is not yet implemented.",
        "error": "Feature not implemented"
    }
    return jsonify(result), 501

@app.route('/analyze_audio', methods=['POST'])
@require_auth_and_paid_tier
def handle_analyze_audio():
    endpoint = request.endpoint
    user_id = g.user.get('id', 'Unknown') if hasattr(g, 'user') else 'Unknown'
    data = request.get_json()
    media_url = data.get('media_url') if data else None

    if not media_url:
        logging.warning(f"@{endpoint}: Missing 'media_url' in JSON payload")
        return jsonify({"error": "Missing 'media_url' in JSON payload"}), 400

    logging.info(f"@{endpoint}: Processing audio analysis for URL: {media_url} by User ID: {user_id}")

    result = {
        "status": "error",
        "audios_analyzed": 0,
        "manipulated_audios_found": 0,
        "manipulation_confidence": 0.0,
        "manipulated_media": [],
        "analysis_summary": "Audio analysis is not yet implemented.",
        "error": "Feature not implemented"
    }
    return jsonify(result), 501

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
