import requests
import json
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route('/analyze_image', methods=['POST'])
def analyze_image():
    data = request.get_json()
    image_url = data.get('image_url')

    if not image_url:
        return jsonify({"error": "No image URL provided"}), 400

    # <<< Existing analysis logic >>>
    api_key = "K85699750588957"
    api_url = "https://api.ocr.space/parse/imageurl"
    payload = {"apikey": api_key, "url": image_url, "language": "eng"}

    try:
        response = requests.get(api_url, params=payload)  # Changed to GET request
        response.raise_for_status()
        ocr_result = response.json()
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Request failed: {e}"}), 500
    except json.JSONDecodeError as e:
        return jsonify({"error": f"Failed to decode JSON response: {e}"}), 500

    # <<< Generate or extract a single-line summary >>>
    # Placeholder: Replace this with actual summary logic
    analysis_summary = f"Analysis summary for image: {image_url[:50]}..."
    # Example if the original result was a dict: analysis_summary = original_result.get('summary_field', "No summary available.")

    # Return only the summary
    return jsonify({"analysis_summary": analysis_summary})

if __name__ == "__main__":
    app.run(debug=True)