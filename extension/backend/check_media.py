import logging
from flask import Flask, request, jsonify
from flask_cors import CORS # Import CORS
import requests
import json
import base64

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Create a Blueprint for media-related routes
media_bp = Flask(__name__)
CORS(media_bp) # Enable CORS for the entire app

def analyze_image(url):
    """Analyze an image for manipulations."""
    params = {
        'url': url,
        'models': 'genai',
        'api_user': '99030650',
        'api_secret': 'rUSbX3YpAnSeWr2GRqpfRqYaJr8HFhdh'
    }
    response = requests.get('https://api.sightengine.com/1.0/check.json', params=params)
    return response.json()

def extract_text_from_image(image_url):
    """Extract text from an image using OCR.space API."""
    api_key = "K85699750588957"
    api_url = "https://api.ocr.space/parse/imageurl"
    payload = {"apikey": api_key, "url": image_url, "language": "eng"}
    response = requests.get(api_url, params=payload)
    return response.json()

def analyze_image_v2(url):
    """Analyze an image for manipulations and return results in the required format."""
    ocr_result = extract_text_from_image(url)
    manipulation_result = analyze_image(url)

    parsed_text = ocr_result.get("ParsedResults", [{}])[0].get("ParsedText", "")
    ai_generated = manipulation_result.get("type", {}).get("ai_generated", 0.0)

    result = {
        "images_analyzed": 1,
        "manipulated_images_found": 0 if ai_generated < 0.5 else 1,
        "manipulation_confidence": ai_generated,
        "manipulated_media": [
            {
                "url": url,
                "type": "image",
                "ParsedText": parsed_text,
                "ai_generated": ai_generated
            }
        ]
    }

    return result

def analyze_media(media_list):
    """Analyze a list of media (images only)."""
    mediaResult = {
        "images_analyzed": 0,
        "manipulated_images_found": 0,
        "manipulation_confidence": 0.0,
        "manipulated_media": []
    }

    for media in media_list:
        if media["type"] == "image":
            # Analyze image using both APIs
            ocr_result = extract_text_from_image(media["url"])
            manipulation_result = analyze_image(media["url"])

            # Extract minimal data from API outputs
            parsed_text = ocr_result.get("ParsedResults", [{}])[0].get("ParsedText", "")
            ai_generated = manipulation_result.get("type", {}).get("ai_generated", 0.0)

            mediaResult["images_analyzed"] += 1
            if manipulation_result.get("status") == "success":
                mediaResult["manipulated_media"].append({
                    "url": media["url"],
                    "type": "image",
                    "ParsedText": parsed_text,
                    "ai_generated": ai_generated
                })

    # Calculate average confidence
    if mediaResult["manipulated_media"]:
        total_confidence = sum(item.get("ai_generated", 0.0) for item in mediaResult["manipulated_media"])
        mediaResult["manipulation_confidence"] = total_confidence / len(mediaResult["manipulated_media"])

    # Print minimal final output
    print(json.dumps(mediaResult, indent=4))
    return mediaResult

def main():
    media_list = [
        {"type": "image", "url": "https://www.slidecow.com/wp-content/uploads/2018/04/Setting-Up-The-Slide-Text.jpg"},
    ]

    for media in media_list:
        if media["type"] == "image":
            result = analyze_image_v2(media["url"])
            print(json.dumps(result, indent=4))

# Update the /analyze_image endpoint to return results in the required format
@media_bp.route('/analyze_image', methods=['POST'])
def handle_analyze_image():
    """Flask endpoint to handle image analysis requests."""
    logging.info("Received request at /analyze_image")

    if not request.is_json:
        logging.warning("Request is not JSON")
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    logging.info(f"Received JSON data: {data}")
    media_url = data.get('media_url')

    if not media_url:
        logging.warning("Missing 'media_url' in JSON payload")
        return jsonify({"error": "Missing 'media_url' in JSON payload"}), 400

    # Call the analyze_image_v2 function from Check_everyMedia.py
    result = analyze_image_v2(media_url)

    logging.info(f"Returning analysis result for: {media_url}")
    # Print the final JSON result to the console
    logging.info(f"Final analysis result: {json.dumps(result, indent=4)}")
    return jsonify(result), 200

# Update the /analyze_video endpoint to return a placeholder response
@media_bp.route('/analyze_video', methods=['POST'])
def handle_analyze_video():
    """Flask endpoint to handle video analysis requests."""
    logging.info("Received request at /analyze_video")

    if not request.is_json:
        logging.warning("Request is not JSON")
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    logging.info(f"Received JSON data: {data}")
    media_url = data.get('media_url')

    if not media_url:
        logging.warning("Missing 'media_url' in JSON payload")
        return jsonify({"error": "Missing 'media_url' in JSON payload"}), 400

    # Placeholder response for video analysis
    result = {
        "videos_analyzed": 1,
        "manipulated_videos_found": 0,
        "manipulation_confidence": 0.0,
        "manipulated_media": [
            {
                "url": media_url,
                "type": "video",
                "ai_generated": 0.0
            }
        ]
    }

    logging.info(f"Returning placeholder video analysis result for: {media_url}")
    return jsonify(result), 200

# --- NEW FAKE Audio Analysis Endpoint ---
@media_bp.route('/analyze_audio', methods=['POST'])
def handle_analyze_audio():
    """Flask endpoint to handle audio analysis requests (FAKE)."""
    logging.info("Received request at /analyze_audio") # <-- Added log
    # Note: SightEngine doesn't typically handle audio, but we keep the fake structure
    return _handle_fake_media_request('audio')

# --- Helper for Fake Media Requests ---
def _handle_fake_media_request(expected_type: str):
    """Helper function to process fake media requests."""
    logging.info(f"Handling fake {expected_type} request. Headers: {request.headers}") # <-- Added log
    if not request.is_json:
        logging.warning("Request is not JSON") # <-- Added log
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    logging.info(f"Received JSON data: {data}") # <-- Added log
    media_url = data.get('media_url')

    logging.info(f"--- FAKE {expected_type.capitalize()} Analysis Request --- URL: {media_url}")

    if not media_url:
        logging.warning("Missing 'media_url' in JSON payload") # <-- Added log
        return jsonify({"error": "Missing 'media_url' in JSON payload"}), 400

    # <<< Generate a single-line summary >>>
    analysis_summary = f"Fake analysis summary for {expected_type}: {media_url[:50]}..."

    logging.info(f"Returning FAKE {expected_type} analysis summary for: {media_url}")
    # <<< Return only the summary field >>>
    return jsonify({"analysis_summary": analysis_summary}), 200
# --- END FAKE Media Endpoints ---

# --- Original SightEngine Example (Commented Out) ---
# import requests
# import json
# params = {
#   'url': 'https://i.ytimg.com/vi/hfqQwro1OqE/maxresdefault.jpg',
#   'models': 'genai',
#   'api_user': 'YOUR_API_USER', # Replace with actual credentials or env vars
#   'api_secret': 'YOUR_API_SECRET' # Replace with actual credentials or env vars
# }
# try:
#     r = requests.get('https://api.sightengine.com/1.0/check.json', params=params)
#     r.raise_for_status() # Raise an exception for bad status codes
#     output = r.json() # Use .json() method
#     print(json.dumps(output, indent=2))
#     print("Status: ", output.get('status', 'N/A')) # Use .get for safer access
# except requests.exceptions.RequestException as e:
#     print(f"Error calling SightEngine API: {e}")
# except json.JSONDecodeError:
#     print(f"Error decoding SightEngine response: {r.text}")

if __name__ == "__main__":
    # Note: Flask's development server is not recommended for production.
    # Use a production-ready WSGI server like Gunicorn or Waitress.
    logging.info("Starting Flask development server for media analysis...") # <-- Added log
    # Use host='0.0.0.0' to make it accessible on the network
    # Use debug=True for development (enables auto-reloading, detailed errors)
    # Set debug=False for production environments
    media_bp.run(host='0.0.0.0', port=3000, debug=True) # Ensure debug is True for auto-reload
    logging.info("Flask server stopping...")
    logging.info("Script finished.")
