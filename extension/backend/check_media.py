import logging
import os
import json
import traceback
from functools import wraps
from typing import Dict, Any

import psycopg2
import psycopg2.pool
import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify, g
from flask_cors import CORS

# --- Load Environment Variables ---
load_dotenv()
logging.critical("--- check_media.py script started ---")

# --- Configuration ---
SIGHTENGINE_API_USER = os.getenv('SIGHTENGINE_API_USER')
SIGHTENGINE_API_SECRET = os.getenv('SIGHTENGINE_API_SECRET')
OCR_SPACE_API_KEY = os.getenv('OCR_SPACE_API_KEY')
SIGHTENGINE_API_URL = 'https://api.sightengine.com/1.0/check.json'
OCR_SPACE_API_URL = 'https://api.ocr.space/parse/imageurl'
GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json'
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "news_analysis_db")
DB_USER = os.getenv("DB_USER", "user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_POOL_MIN_CONN = 1
DB_POOL_MAX_CONN = 5
USERS_TABLE = "users"
DEFAULT_USER_TIER = "free"
PAID_TIER = "paid" # Tier required for media analysis
API_TIMEOUT_SECONDS = 20 # Increased timeout

# --- Logging Setup ---
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(module)s:%(lineno)d - %(message)s')
logging.info("Logging configured with level DEBUG.")

# --- Custom Exceptions ---
class ConfigurationError(Exception): pass
class DatabaseError(Exception): pass
class ApiError(Exception): pass
class AuthenticationError(Exception): pass # For 401 issues (invalid token/user)
class AuthorizationError(Exception): pass # For 403 issues (insufficient permissions/tier)

# --- Flask App Setup ---
app = Flask(__name__)
# Allow requests from the extension's origin (and potentially others)
# Be more specific in production if possible (e.g., specific extension ID)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True, methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "Authorization", "Accept"])
logging.info("Flask app created and CORS configured.")

# --- Database Connection Pool ---
db_pool = None

def initialize_db_pool():
    """Initializes the PostgreSQL connection pool."""
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
        # Test connection
        conn = db_pool.getconn()
        logging.info(f"Database connection pool test successful (PostgreSQL version: {conn.server_version}).")
        db_pool.putconn(conn)
        logging.info("Database connection pool initialized successfully.")
    except (psycopg2.OperationalError, psycopg2.Error) as e:
        logging.error(f"FATAL: Error initializing database connection pool: {e}", exc_info=True)
        db_pool = None # Ensure pool is None if init fails
        raise DatabaseError(f"Failed to initialize database pool: {e}")
    except Exception as e:
        logging.error(f"FATAL: Unexpected error initializing database pool: {e}", exc_info=True)
        db_pool = None
        raise DatabaseError(f"Unexpected error initializing database pool: {e}")

def get_db_connection():
    """Gets a connection from the pool."""
    if db_pool is None:
        logging.error("Attempted to get DB connection, but pool is not initialized.")
        # Attempt re-initialization in case of transient issues
        try:
            initialize_db_pool()
        except DatabaseError:
             logging.error("Re-initialization of DB pool failed.")
             raise DatabaseError("Database pool is not available and initialization failed.")
        if db_pool is None: # Check again after re-init attempt
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
    """Releases a connection back to the pool."""
    if db_pool and conn:
        conn_id = id(conn)
        try:
            logging.debug(f"Releasing connection (ID: {conn_id}) back to pool.")
            db_pool.putconn(conn)
            logging.debug(f"Connection (ID: {conn_id}) released successfully.")
        except Exception as e:
            logging.error(f"Error releasing connection (ID: {conn_id}) to pool: {e}", exc_info=True)
            # Attempt to close the connection manually if putting back failed
            try:
                logging.warning(f"Attempting manual close for connection (ID: {conn_id}).")
                conn.close()
            except Exception as close_err:
                logging.error(f"Failed to manually close connection (ID: {conn_id}): {close_err}")

def close_db_pool():
    """Closes all connections in the pool."""
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
    """Checks if all required environment variables are set."""
    logging.info("Checking media backend configuration...")
    required_vars = {
        "SIGHTENGINE_API_USER": SIGHTENGINE_API_USER,
        "SIGHTENGINE_API_SECRET": SIGHTENGINE_API_SECRET,
        "OCR_SPACE_API_KEY": OCR_SPACE_API_KEY,
        "DB_HOST": DB_HOST, "DB_PORT": DB_PORT, "DB_NAME": DB_NAME,
        "DB_USER": DB_USER, "DB_PASSWORD": DB_PASSWORD,
    }
    missing_vars = [name for name, value in required_vars.items() if not value or str(value).startswith("YOUR_")]
    if missing_vars:
        error_msg = f"Missing or placeholder required configuration variables: {', '.join(missing_vars)}"
        logging.critical(error_msg)
        raise ConfigurationError(error_msg)
    logging.info("Media backend configuration check passed.")
    # Initialize DB pool only after config check passes
    initialize_db_pool()

# --- User Management ---
def get_or_create_user(google_id: str) -> Dict[str, Any]:
    """
    Retrieves user details (id, tier) from the database based on Google ID.
    If the user doesn't exist, creates a new user with the default 'free' tier.

    Args:
        google_id: The user's unique Google ID ('sub').

    Returns:
        A dictionary containing the user's internal database ID and tier.

    Raises:
        AuthenticationError: If google_id is empty or None.
        DatabaseError: If database operations fail.
    """
    logging.debug(f"get_or_create_user: Attempting lookup/creation for google_id: '{google_id}'")
    if not google_id: # Check if google_id is None or empty string
        logging.error("get_or_create_user: Received empty or None google_id.")
        raise AuthenticationError("Google User ID cannot be empty.") # Use specific exception

    conn = None
    try:
        conn = get_db_connection()
        logging.debug(f"get_or_create_user: Acquired DB connection for google_id: {google_id}")
        with conn.cursor() as cursor: # Use context manager for cursor
            logging.debug(f"get_or_create_user: Executing SELECT for google_id: {google_id}")
            cursor.execute(f"SELECT id, tier FROM {USERS_TABLE} WHERE google_id = %s", (google_id,))
            user_record = cursor.fetchone()

            if user_record:
                user_id, tier = user_record
                logging.info(f"get_or_create_user: Found existing user (ID: {user_id}, Tier: {tier}) for google_id: {google_id}")
                return {"id": user_id, "tier": tier}
            else:
                logging.info(f"get_or_create_user: No existing user found. Creating new user for google_id: {google_id}")
                # Create new user with the default tier
                cursor.execute(
                    f"""INSERT INTO {USERS_TABLE} (google_id, email, tier, created_at)
                       VALUES (%s, %s, %s, NOW()) RETURNING id, tier;""",
                    (google_id, None, DEFAULT_USER_TIER) # Create with default tier
                )
                new_user_record = cursor.fetchone()
                if new_user_record:
                    user_id, tier = new_user_record
                    logging.info(f"get_or_create_user: Created new user (ID: {user_id}, Tier: {tier}) for google_id: {google_id}")
                    conn.commit() # Commit the transaction
                    return {"id": user_id, "tier": tier}
                else:
                    # This case should ideally not happen if RETURNING is used correctly
                    logging.error(f"get_or_create_user: Failed to retrieve new user details after insertion for google_id: {google_id}")
                    conn.rollback() # Rollback if insert seemed to fail
                    raise DatabaseError("Failed to retrieve new user details after insertion.")

    except AuthenticationError as ae: # Catch specific auth error
        logging.error(f"get_or_create_user: AuthenticationError for google_id '{google_id}': {ae}")
        raise ae # Re-raise the AuthenticationError
    except (psycopg2.Error, DatabaseError) as e:
        logging.error(f"get_or_create_user: Database error for google_id '{google_id}': {e}", exc_info=True)
        if conn: conn.rollback() # Rollback on error
        # Wrap psycopg2 errors in DatabaseError for consistent handling
        raise DatabaseError(f"DB error accessing user data for google_id {google_id}: {e}")
    except Exception as e:
        logging.error(f"get_or_create_user: Unexpected error for google_id '{google_id}': {e}", exc_info=True)
        if conn: conn.rollback()
        raise DatabaseError(f"Unexpected error accessing user data for google_id {google_id}: {e}")
    finally:
        if conn:
            release_db_connection(conn)

# --- Authentication & Authorization Decorator ---
def require_auth_and_paid_tier(f):
    """
    Decorator to:
    1. Authenticate the user via Google OAuth Bearer token (get Google ID).
    2. Look up or create the user in the database based on the Google ID.
    3. Check if the user has the required 'paid' tier.
    Stores user info (db id, tier) in Flask's 'g' object for the request context.
    Returns 401 (Unauthorized) if token is invalid or user lookup fails.
    Returns 403 (Forbidden) if user tier is not 'paid'.
    Returns 500 (Server Error) for database issues during auth.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        endpoint = request.endpoint or "unknown_endpoint"
        logging.debug(f"@{endpoint}: require_auth_and_paid_tier decorator invoked.")

        # --- Step 1: Authenticate via OAuth Bearer token ---
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            logging.warning(f"@{endpoint}: Missing or invalid Authorization header.")
            return jsonify({"error": "Authorization header missing or invalid"}), 401
        token = auth_header.split(' ', 1)[1]

        # Fetch user info from Google to verify token and get Google ID
        try:
            userinfo_resp = requests.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {token}"},
                timeout=API_TIMEOUT_SECONDS
            )
            # Check for non-200 status codes (e.g., 401 for invalid token)
            if userinfo_resp.status_code != 200:
                logging.warning(f"@{endpoint}: Google userinfo fetch failed with status {userinfo_resp.status_code}. Token might be invalid or expired.")
                # Provide a generic error message for security
                return jsonify({"error": "Authentication failed"}), 401
            userinfo = userinfo_resp.json()
            google_user_id = userinfo.get('id') # 'sub' is the standard field, but 'id' is often used too
            if not google_user_id:
                logging.error(f"@{endpoint}: No 'id' (or 'sub') found in Google userinfo response.")
                return jsonify({"error": "Authentication failed"}), 401
        except requests.RequestException as e:
            logging.error(f"@{endpoint}: Network error fetching Google user info: {e}", exc_info=True)
            return jsonify({"error": "Authentication failed due to network issue"}), 401
        except json.JSONDecodeError as e:
             logging.error(f"@{endpoint}: Failed to decode Google userinfo response: {e}", exc_info=True)
             return jsonify({"error": "Authentication failed"}), 401

        logging.info(f"@{endpoint}: Successfully validated token for Google user ID: {google_user_id}")

        # --- Step 2: Authenticate User (Lookup/Create in DB) ---
        try:
            # Get user details (db id, tier) from our database
            db_user = get_or_create_user(google_user_id)
            g.user = db_user  # Store user info {id, tier} in request context 'g'
            logging.info(f"@{endpoint}: User authenticated successfully. DB User ID: {g.user.get('id')}, Tier: {g.user.get('tier')}")
        except AuthenticationError as auth_err: # Should not happen if google_id is valid, but handle defensively
            logging.warning(f"@{endpoint}: Authentication failed (get_or_create_user). Error: {auth_err}")
            return jsonify({"error": f"Authentication failed: {auth_err}"}), 401
        except DatabaseError as db_err:
            logging.error(f"@{endpoint}: Database error during user authentication. Error: {db_err}", exc_info=True)
            return jsonify({"error": f"Server error during user authentication: {db_err}"}), 500
        except Exception as e:
             logging.error(f"@{endpoint}: Unexpected error during user authentication. Error: {e}", exc_info=True)
             return jsonify({"error": "Unexpected server error during authentication"}), 500


        # --- Step 3: Authorize User (Check Tier) ---
        user_tier = g.user.get('tier')
        # ** This is the crucial check: refuse if not the required PAID_TIER **
        if user_tier != PAID_TIER:
            logging.warning(f"@{endpoint}: Authorization failed. User {g.user['id']} (Tier: {user_tier}) does not have required tier '{PAID_TIER}'. Access denied.")
            # Return 403 Forbidden
            return jsonify({"error": f"Access denied. This feature requires a '{PAID_TIER}' subscription."}), 403

        logging.info(f"@{endpoint}: Authorization successful. User {g.user['id']} has required tier '{PAID_TIER}'.")

        # --- All checks passed, proceed to the actual route function ---
        logging.debug(f"@{endpoint}: Authentication & Authorization successful, proceeding to route function.")
        return f(*args, **kwargs)

    return decorated_function

# --- API Client Functions ---
def call_sightengine_api(image_url: str) -> Dict[str, Any]:
    """Calls Sightengine API for generative AI detection."""
    logging.info(f"Calling Sightengine API for URL: {image_url}")
    if not SIGHTENGINE_API_USER or not SIGHTENGINE_API_SECRET:
        raise ConfigurationError("Sightengine API credentials not configured.")

    params = {
        'url': image_url,
        'models': 'genai', # Focus on generative AI detection model
        'api_user': SIGHTENGINE_API_USER,
        'api_secret': SIGHTENGINE_API_SECRET
    }
    try:
        response = requests.get(SIGHTENGINE_API_URL, params=params, timeout=API_TIMEOUT_SECONDS)
        logging.debug(f"Sightengine API response status: {response.status_code}, URL: {response.url}")
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        result = response.json()
        logging.debug(f"Sightengine API raw response: {json.dumps(result)}")
        return result
    except requests.exceptions.Timeout:
        logging.error(f"Sightengine API request timed out after {API_TIMEOUT_SECONDS}s for URL: {image_url}")
        raise ApiError(f"Sightengine API request timed out.")
    except requests.exceptions.RequestException as e:
        # Log specific HTTP errors if available
        status_code = e.response.status_code if e.response else "N/A"
        logging.error(f"Sightengine API request failed (Status: {status_code}): {e}")
        raise ApiError(f"Sightengine API request failed: {e}")
    except json.JSONDecodeError as e:
        logging.error(f"Failed to decode Sightengine API response JSON: {e}. Response text: {response.text[:200]}")
        raise ApiError("Invalid JSON response from Sightengine API.")

def call_ocr_space_api(image_url: str) -> Dict[str, Any]:
    """Calls OCR.space API to extract text from image."""
    logging.info(f"Calling OCR.space API for URL: {image_url}")
    if not OCR_SPACE_API_KEY:
        raise ConfigurationError("OCR.space API Key not configured.")

    payload = {
        "apikey": OCR_SPACE_API_KEY,
        "url": image_url,
        "language": "eng",        # Specify English language
        "isOverlayRequired": False # We only need the parsed text
    }
    try:
        response = requests.post(OCR_SPACE_API_URL, data=payload, timeout=API_TIMEOUT_SECONDS) # Use POST as recommended
        logging.debug(f"OCR.space API response status: {response.status_code}")
        response.raise_for_status()
        result = response.json()
        logging.debug(f"OCR.space API raw response: {json.dumps(result)}")

        # Check for errors reported within the OCR.space JSON response
        if result.get("IsErroredOnProcessing"):
            error_message = result.get("ErrorMessage", ["Unknown OCR processing error"])[0]
            logging.error(f"OCR.space API processing error: {error_message}")
            # Treat processing error as an API error for consistent handling
            raise ApiError(f"OCR processing error: {error_message}")
        return result
    except requests.exceptions.Timeout:
        logging.error(f"OCR.space API request timed out after {API_TIMEOUT_SECONDS}s for URL: {image_url}")
        raise ApiError(f"OCR.space API request timed out.")
    except requests.exceptions.RequestException as e:
        status_code = e.response.status_code if e.response else "N/A"
        logging.error(f"OCR.space API request failed (Status: {status_code}): {e}")
        raise ApiError(f"OCR.space API request failed: {e}")
    except json.JSONDecodeError as e:
        logging.error(f"Failed to decode OCR.space API response JSON: {e}. Response text: {response.text[:200]}")
        raise ApiError("Invalid JSON response from OCR.space API.")

# --- Analysis Logic ---
def analyze_image_logic(image_url: str) -> Dict[str, Any]:
    """
    Orchestrates image analysis using Sightengine (AI detection) and OCR.space (text extraction).

    Args:
        image_url: The URL of the image to analyze.

    Returns:
        A dictionary containing the combined analysis results, structured
        for the frontend. Includes 'status': 'success' or 'error'.
        Includes 'error' message if status is 'error'.
    """
    logging.info(f"Starting image analysis logic for: {image_url}")
    manipulation_result = None
    ocr_result = None
    manipulation_error = None
    ocr_error = None

    # --- Call External APIs ---
    # Call Sightengine for AI/manipulation detection
    try:
        manipulation_result = call_sightengine_api(image_url)
    except (ApiError, ConfigurationError) as e:
        logging.warning(f"Sightengine analysis failed for {image_url}: {e}")
        manipulation_error = str(e)
    except Exception as e: # Catch unexpected errors
        logging.error(f"Unexpected error calling Sightengine for {image_url}: {e}", exc_info=True)
        manipulation_error = "Unexpected server error during manipulation check."


    # Call OCR.space for text extraction
    try:
        ocr_result = call_ocr_space_api(image_url)
    except (ApiError, ConfigurationError) as e:
        logging.warning(f"OCR analysis failed for {image_url}: {e}")
        ocr_error = str(e)
    except Exception as e: # Catch unexpected errors
        logging.error(f"Unexpected error calling OCR.space for {image_url}: {e}", exc_info=True)
        ocr_error = "Unexpected server error during text extraction."

    # --- Process API Results ---
    ai_generated_confidence = 0.0 # Default confidence
    parsed_text = ""              # Default empty text

    # Process Sightengine result
    if manipulation_result and manipulation_result.get("status") == "success":
        # Extract the confidence score for AI generation
        ai_generated_confidence = manipulation_result.get("genai", {}).get("prob", 0.0) # Use 'genai' model output
        logging.info(f"Sightengine result for {image_url}: AI Gen Probability = {ai_generated_confidence:.4f}")
    elif not manipulation_error: # If no specific error caught, but result is not success
        # Try to get error message from Sightengine response
        se_error_info = manipulation_result.get("error", {}) if manipulation_result else {}
        manipulation_error = se_error_info.get("message", "Unknown Sightengine issue")
        logging.warning(f"Sightengine analysis had non-success status for {image_url}: {manipulation_error}")

    # Process OCR result
    if ocr_result and not ocr_result.get("IsErroredOnProcessing") and ocr_result.get("ParsedResults"):
        # Concatenate text from all parsed results/lines if necessary, handle potential structure variations
        all_text = []
        for res in ocr_result.get("ParsedResults", []):
            all_text.append(res.get("ParsedText", ""))
        parsed_text = "\n".join(all_text).strip()
        logging.info(f"OCR result for {image_url}: Extracted text length = {len(parsed_text)}")
        if not parsed_text:
             logging.info(f"OCR result for {image_url}: No text found in image.")
             # Don't set ocr_error if API call was successful but no text was found
             # ocr_error = "No text found in image." # Optional: Treat no text as an error?
    elif not ocr_error: # If no specific error caught, but result indicates failure
        ocr_error = "OCR processing failed or no text could be extracted." # Generic error if specific one wasn't raised
        logging.warning(f"OCR analysis failed or yielded no text for {image_url}")


    # --- Combine and Summarize Results ---
    final_status = "success" # Assume success unless both APIs fail critically
    analysis_summary = ""
    # Use a threshold (e.g., 0.5 or higher depending on desired sensitivity) for classification
    manipulation_threshold = 0.5
    is_likely_manipulated = ai_generated_confidence >= manipulation_threshold

    # Build the summary message based on success/failure of each part
    summary_parts = []
    if manipulation_error:
        summary_parts.append(f"Manipulation Check Error: {manipulation_error}")
        is_likely_manipulated = False # Result is unreliable
        ai_generated_confidence = 0.0 # Result is unreliable
    else:
        detection_status = 'Likely AI/Manipulated' if is_likely_manipulated else 'Likely Authentic'
        summary_parts.append(f"Detection: {detection_status} (Confidence: {ai_generated_confidence:.2f})")

    if ocr_error:
        summary_parts.append(f"Text Extraction Error: {ocr_error}")
    elif parsed_text:
        summary_parts.append(f"Extracted Text: '{parsed_text[:100]}{'...' if len(parsed_text) > 100 else ''}'") # Show snippet
    else:
        summary_parts.append("No text extracted.")

    analysis_summary = ". ".join(summary_parts)

    # Determine overall status - consider it an error only if both fail? Or if manipulation check fails?
    # Let's define 'error' status if the primary check (manipulation) fails.
    if manipulation_error:
        final_status = "error"
        # analysis_summary = f"Analysis failed. Manipulation check error: {manipulation_error}. " + \
        #                    (f"Text extraction error: {ocr_error}" if ocr_error else \
        #                     ("Extracted text successfully." if parsed_text else "No text extracted."))
        # Keep the combined summary_parts message for more detail

    # Construct final result object matching expected frontend structure
    result = {
        "status": final_status,
        # Only include top-level 'error' if the overall status is 'error'
        "error": analysis_summary if final_status == "error" else None,
        "analysis_summary": analysis_summary, # Always include the detailed summary
        "images_analyzed": 1, # Assuming single image analysis per call
        "manipulated_images_found": 1 if is_likely_manipulated and not manipulation_error else 0,
        "manipulation_confidence": ai_generated_confidence if not manipulation_error else None, # Provide confidence if check succeeded
        "manipulated_media": [ # Array structure, potentially for future multi-media analysis
            {
                "url": image_url,
                "type": "image",
                "is_likely_manipulated": is_likely_manipulated if not manipulation_error else None,
                "ai_confidence": ai_generated_confidence if not manipulation_error else None,
                "parsed_text": parsed_text if not ocr_error else None,
                "ocr_error": ocr_error, # Include specific errors for debugging/display
                "manipulation_error": manipulation_error
            }
        ]
    }

    logging.info(f"Image analysis complete for {image_url}. Final Status: {final_status}, Summary: {analysis_summary}")
    return result

# --- Flask Endpoints ---

# Handle OPTIONS requests for CORS preflight
@app.route('/analyze_image', methods=['OPTIONS'])
@app.route('/analyze_video', methods=['OPTIONS'])
@app.route('/analyze_audio', methods=['OPTIONS'])
def handle_options():
    # CORS headers are handled by the Flask-CORS extension
    logging.debug(f"OPTIONS request received for {request.path}")
    return jsonify(success=True)

@app.route('/analyze_image', methods=['POST'])
def handle_analyze_image():
    """Endpoint to handle image analysis requests."""
    endpoint = request.endpoint

    # Get JSON data from request
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
        # Perform the analysis
        result = analyze_image_logic(media_url)
        # Determine status code based on the result's status field
        # Return 200 even if analysis had partial errors, use status field in JSON
        status_code = 200 # Use 500 only for totally unexpected server errors below
        logging.info(f"@{endpoint}: Analysis finished for {media_url}. Returning status {status_code}.")
        return jsonify(result), status_code
    except Exception as e:
        # Catch unexpected errors during analysis logic itself
        logging.error(f"@{endpoint}: Unexpected error during image analysis logic for {media_url}: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "error": "An unexpected server error occurred during image analysis.",
            "analysis_summary": "Analysis failed due to unexpected server error."
            }), 500

# --- Placeholder Endpoints for Video/Audio ---
@app.route('/analyze_video', methods=['POST'])
def handle_analyze_video():
    """Placeholder endpoint for video analysis."""
    endpoint = request.endpoint

    data = request.get_json()
    if not data: return jsonify({"error": "Missing JSON payload"}), 400
    media_url = data.get('media_url')
    if not media_url: return jsonify({"error": "Missing 'media_url'"}), 400

    logging.info(f"@{endpoint}: Placeholder video analysis called for URL: {media_url}")
    # Return 501 Not Implemented
    return jsonify({
        "status": "error",
        "error": "Video analysis is not yet implemented.",
        "analysis_summary": "Video analysis unavailable."
        }), 501 # 501 Not Implemented is appropriate here

@app.route('/analyze_audio', methods=['POST'])
def handle_analyze_audio():
    """Placeholder endpoint for audio analysis."""
    endpoint = request.endpoint

    data = request.get_json()
    if not data: return jsonify({"error": "Missing JSON payload"}), 400
    media_url = data.get('media_url')
    if not media_url: return jsonify({"error": "Missing 'media_url'"}), 400

    logging.info(f"@{endpoint}: Placeholder audio analysis called for URL: {media_url}")
    # Return 501 Not Implemented
    return jsonify({
        "status": "error",
        "error": "Audio analysis is not yet implemented.",
        "analysis_summary": "Audio analysis unavailable."
        }), 501 # 501 Not Implemented

# --- Health Check / Index Route ---
@app.route('/')
def index():
    """Basic health check endpoint."""
    logging.debug("Root path '/' accessed (health check).")
    db_status = "Unknown"
    db_pool_status = "Not Initialized" if db_pool is None else "Initialized"
    try:
        # Quick DB check if pool is initialized
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

# --- Teardown and Main Execution ---
@app.teardown_appcontext
def teardown_db(exception=None):
    """Cleans up resources at the end of a request context."""
    # Remove user from Flask's 'g' object to prevent leaks between requests
    user = g.pop('user', None)
    if user:
        logging.debug("Removed user from app context 'g'.")
    if exception:
         # Log any exceptions that caused the context teardown
         logging.error(f"App context teardown triggered by exception: {exception}", exc_info=True)

# Graceful shutdown handler (optional, depends on deployment)
# import signal
# def signal_handler(sig, frame):
#     print('Received signal to shutdown.')
#     shutdown_server()
#     exit(0)
# signal.signal(signal.SIGINT, signal_handler) # Handle Ctrl+C
# signal.signal(signal.SIGTERM, signal_handler) # Handle termination signal

def shutdown_server():
    """Closes the database pool gracefully."""
    logging.info("Server shutting down...")
    close_db_pool()
    logging.info("Shutdown complete.")

# Run the app
if __name__ == "__main__":
    try:
        # Check configuration and initialize DB pool before starting app
        check_configuration()
        logging.info("Configuration check passed and DB pool initialized.")

        # Get port from environment or default to 3000
        port = int(os.environ.get("PORT", 3000))
        # Debug mode should ideally be False in production
        debug_mode = os.environ.get("FLASK_DEBUG", "True").lower() == "true"

        logging.info(f"Starting Flask app on host 0.0.0.0, port {port} with debug={debug_mode}")

        # Use Waitress or Gunicorn for production instead of app.run()
        # For development:
        app.run(host='0.0.0.0', port=port, debug=debug_mode)

    except (ConfigurationError, DatabaseError) as e:
        logging.critical(f"CRITICAL STARTUP ERROR: {e}. Flask app cannot start.", exc_info=True)
        # Exit if essential config/DB setup fails
        exit(1)
    except Exception as e:
         logging.critical(f"CRITICAL UNHANDLED ERROR running Flask app: {e}", exc_info=True)
         exit(1)
    finally:
        # This block executes when app.run() finishes or is interrupted
        shutdown_server()
        logging.info("Media analysis script finished.")
