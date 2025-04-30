import logging
from flask import Flask, request, jsonify
from flask_cors import CORS # Import CORS

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Create a Blueprint for media-related routes
media_bp = Flask(__name__)
CORS(media_bp) # Enable CORS for the entire app

# --- NEW FAKE Image Analysis Endpoint ---
@media_bp.route('/analyze_image', methods=['POST'])
def handle_analyze_image():
    """Flask endpoint to handle image analysis requests (FAKE)."""
    logging.info("Received request at /analyze_image") # <-- Added log
    return _handle_fake_media_request('image')

# --- NEW FAKE Video Analysis Endpoint ---
@media_bp.route('/analyze_video', methods=['POST'])
def handle_analyze_video():
    """Flask endpoint to handle video analysis requests (FAKE)."""
    logging.info("Received request at /analyze_video") # <-- Added log
    return _handle_fake_media_request('video')

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
