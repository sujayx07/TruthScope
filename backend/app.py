import os
import requests
from flask import Flask, request, jsonify
from transformers import pipeline
import dotenv

# Load environment variables from .env file
dotenv.load_dotenv()

app = Flask(__name__)

API_KEY = os.getenv("GOOGLE_FACT_CHECK_API_KEY")

if not API_KEY:
    raise ValueError("❌ ERROR: Missing API Key! Set 'GOOGLE_FACT_CHECK_API_KEY' in your environment variables.")

try:
    classifier = pipeline("text-classification", model="jy46604790/Fake-News-Bert-Detect")
except Exception as e:
    print(f"❌ Model Loading Error: {e}")
    classifier = None

@app.route("/check", methods=["POST"])
def check():
    if not classifier:
        return jsonify({"error": "Model failed to load, please check logs"}), 500

    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing 'text' field in request"}), 400

    try:
        result = classifier(data["text"])
        label = result[0]["label"]
        score = result[0]["score"]

        fact_check_result = fact_check(data["text"])  # Use fact-check API
        return jsonify({
            "label": label,
            "score": score,
            "fact_check": fact_check_result
        })
    except Exception as e:
        return jsonify({"error": f"Model processing error: {str(e)}"}), 500

def fact_check(query):
    url = f"https://factchecktools.googleapis.com/v1alpha1/claims:search?query={query}&key={API_KEY}"
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        claims = data.get("claims", [])
        if not claims:
            return "No fact-check sources found."

        fact_sources = [
            {"title": claim["text"], "source": claim["claimReview"][0]["publisher"]["name"]}
            for claim in claims
        ]
        return fact_sources
    except requests.exceptions.RequestException as e:
        return f"Fact-check API request failed: {str(e)}"

if __name__ == "__main__":
    app.run(debug=True)