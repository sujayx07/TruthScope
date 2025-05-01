import logging
import os
from dotenv import load_dotenv # Add this import
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json

load_dotenv() # Load environment variables from .env file

# --- Configuration ---
SIGHTENGINE_API_USER = os.environ.get('SIGHTENGINE_API_USER') # Remove default
SIGHTENGINE_API_SECRET = os.environ.get('SIGHTENGINE_API_SECRET') # Remove default
OCR_SPACE_API_KEY = os.environ.get('OCR_SPACE_API_KEY') # Remove default
SIGHTENGINE_API_URL = 'https://api.sightengine.com/1.0/check.json'
OCR_SPACE_API_URL = 'https://api.ocr.space/parse/imageurl'

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(module)s - %(message)s')

# Create Flask app and enable CORS
app = Flask(__name__)
CORS(app)

# --- API Client Functions ---

def call_sightengine_api(image_url):
    """Calls the Sightengine API to check for AI generation."""
    logging.info(f"Calling Sightengine API for URL: {image_url}")
    params = {
        'url': image_url,
        'models': 'genai',
        'api_user': SIGHTENGINE_API_USER,
        'api_secret': SIGHTENGINE_API_SECRET
    }
    try:
        response = requests.get(SIGHTENGINE_API_URL, params=params, timeout=15)
        response.raise_for_status()
        logging.info(f"Sightengine API response status: {response.status_code}")
        return response.json()
    except requests.exceptions.RequestException as e:
        logging.error(f"Sightengine API request failed: {e}")
        return {"error": f"Sightengine API request failed: {e}", "status": "error"}
    except json.JSONDecodeError:
        logging.error("Failed to decode Sightengine API response JSON.")
        return {"error": "Invalid JSON response from Sightengine API", "status": "error"}

def call_ocr_space_api(image_url):
    """Calls the OCR.space API to extract text."""
    logging.info(f"Calling OCR.space API for URL: {image_url}")
    payload = {
        "apikey": OCR_SPACE_API_KEY,
        "url": image_url,
        "language": "eng"
    }
    try:
        response = requests.get(OCR_SPACE_API_URL, params=payload, timeout=15)
        response.raise_for_status()
        logging.info(f"OCR.space API response status: {response.status_code}")
        result = response.json()
        if result.get("IsErroredOnProcessing"):
            error_message = result.get("ErrorMessage", ["Unknown OCR error"])[0]
            logging.error(f"OCR.space API processing error: {error_message}")
            return {"error": f"OCR processing error: {error_message}", "status": "error"}
        return result
    except requests.exceptions.RequestException as e:
        logging.error(f"OCR.space API request failed: {e}")
        return {"error": f"OCR.space API request failed: {e}", "status": "error"}
    except json.JSONDecodeError:
        logging.error("Failed to decode OCR.space API response JSON.")
        return {"error": "Invalid JSON response from OCR.space API", "status": "error"}

# --- Analysis Logic ---

def analyze_image_logic(image_url):
    """Analyzes an image using Sightengine and OCR.space, returning a structured result."""
    logging.info(f"Starting image analysis for: {image_url}")

    manipulation_result = call_sightengine_api(image_url)
    ocr_result = call_ocr_space_api(image_url)

    ai_generated = 0.0
    manipulation_confidence = 0.0
    manipulation_error = None
    if manipulation_result.get("status") == "success":
        ai_generated = manipulation_result.get("type", {}).get("ai_generated", 0.0)
        manipulation_confidence = ai_generated
    elif manipulation_result.get("status") == "error":
        manipulation_error = manipulation_result.get("error", "Unknown Sightengine error")
        logging.warning(f"Sightengine analysis failed for {image_url}: {manipulation_error}")
    else:
        manipulation_error = manipulation_result.get("error", "Unexpected response from Sightengine")
        logging.warning(f"Sightengine analysis had unexpected response for {image_url}: {manipulation_result}")

    parsed_text = ""
    ocr_error = None
    if ocr_result and not ocr_result.get("IsErroredOnProcessing") and ocr_result.get("ParsedResults"):
        parsed_text = ocr_result["ParsedResults"][0].get("ParsedText", "").strip()
    elif ocr_result.get("status") == "error":
        ocr_error = ocr_result.get("error", "Unknown OCR error")
        logging.warning(f"OCR analysis failed for {image_url}: {ocr_error}")
    else:
        ocr_error = ocr_result.get("error", "Unexpected response from OCR.space")
        logging.warning(f"OCR analysis had unexpected response for {image_url}: {ocr_result}")

    analysis_summary = ""
    final_status = "success"
    manipulated_found = 1 if ai_generated >= 0.5 else 0

    if manipulation_error and ocr_error:
        analysis_summary = f"Analysis failed. Sightengine: {manipulation_error}. OCR: {ocr_error}"
        final_status = "error"
        manipulated_found = 0
        manipulation_confidence = 0.0
    elif manipulation_error:
        analysis_summary = f"Manipulation check failed: {manipulation_error}. OCR Text: '{parsed_text[:50]}...'" if parsed_text else "Manipulation check failed. No text extracted."
        manipulated_found = 0
        manipulation_confidence = 0.0
    elif ocr_error:
        analysis_summary = f"AI Gen: {ai_generated:.2f}. OCR failed: {ocr_error}"
    else:
        detection_text = f"Detected as {'AI Generated' if manipulated_found else 'Likely Authentic'} (Confidence: {manipulation_confidence:.2f})."
        ocr_text_summary = f" Extracted text: '{parsed_text[:50]}...'" if parsed_text else " No text extracted."
        analysis_summary = detection_text + ocr_text_summary

    result = {
        "status": final_status,
        "images_analyzed": 1,
        "manipulated_images_found": manipulated_found,
        "manipulation_confidence": manipulation_confidence,
        "manipulated_media": [
            {
                "url": image_url,
                "type": "image",
                "parsed_text": parsed_text if not ocr_error else None,
                "ai_generated": ai_generated if not manipulation_error else None,
                "ocr_error": ocr_error,
                "manipulation_error": manipulation_error
            }
        ],
        "analysis_summary": analysis_summary
    }

    logging.info(f"Image analysis complete for {image_url}. Summary: {analysis_summary}")
    return result

# --- Flask Endpoints ---

def validate_request(request):
    """Validates incoming request for JSON and media_url."""
    if not request.is_json:
        logging.warning("Request is not JSON")
        return None, jsonify({"error": "Request must be JSON", "analysis_summary": "Error: Invalid request format."}), 400

    data = request.get_json()
    logging.debug(f"Received JSON data: {data}")
    media_url = data.get('media_url')

    if not media_url:
        logging.warning("Missing 'media_url' in JSON payload")
        return None, jsonify({"error": "Missing 'media_url' in JSON payload", "analysis_summary": "Error: Missing media URL."}), 400

    if not (media_url.startswith('http://') or media_url.startswith('https://')):
        logging.warning(f"Invalid 'media_url' format: {media_url}")
        return None, jsonify({"error": "Invalid 'media_url' format", "analysis_summary": "Error: Invalid media URL format."}), 400

    return media_url, None, None

@app.route('/analyze_image', methods=['POST'])
def handle_analyze_image():
    """Flask endpoint to handle image analysis requests."""
    logging.info("Received request at /analyze_image")
    media_url, error_response, status_code = validate_request(request)
    if error_response:
        return error_response, status_code

    try:
        result = analyze_image_logic(media_url)
        http_status = 200 if result.get("status") == "success" else 500
        logging.info(f"Returning image analysis result for: {media_url}")
        return jsonify(result), http_status
    except Exception as e:
        logging.exception(f"Unexpected error during image analysis for {media_url}: {e}")
        return jsonify({
            "error": "An unexpected server error occurred during image analysis.",
            "status": "error",
            "analysis_summary": "Error: Server failed during image analysis."
        }), 500

@app.route('/analyze_video', methods=['POST'])
def handle_analyze_video():
    """Flask endpoint for video analysis (Placeholder)."""
    logging.info("Received request at /analyze_video")
    media_url, error_response, status_code = validate_request(request)
    if error_response:
        return error_response, status_code

    result = {
        "status": "success",
        "videos_analyzed": 1,
        "manipulated_videos_found": 0,
        "manipulation_confidence": 0.0,
        "manipulated_media": [
            {
                "url": media_url,
                "type": "video",
                "ai_generated": None,
                "error": None
            }
        ],
        "analysis_summary": "Video analysis is not yet implemented."
    }
    logging.info(f"Returning placeholder video analysis result for: {media_url}")
    return jsonify(result), 200

@app.route('/analyze_audio', methods=['POST'])
def handle_analyze_audio():
    """Flask endpoint for audio analysis (Placeholder)."""
    logging.info("Received request at /analyze_audio")
    media_url, error_response, status_code = validate_request(request)
    if error_response:
        return error_response, status_code

    result = {
        "status": "success",
        "audios_analyzed": 1,
        "manipulated_audios_found": 0,
        "manipulation_confidence": 0.0,
        "manipulated_media": [
            {
                "url": media_url,
                "type": "audio",
                "ai_generated": None,
                "error": None
            }
        ],
        "analysis_summary": "Audio analysis is not yet implemented."
    }
    logging.info(f"Returning placeholder audio analysis result for: {media_url}")
    return jsonify(result), 200

# --- Main Execution ---

if __name__ == "__main__":
    logging.info("Starting Flask development server for media analysis...")
    app.run(host='0.0.0.0', port=3000, debug=True)
    logging.info("Flask server stopping.")
