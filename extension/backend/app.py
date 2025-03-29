import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import pipeline
import dotenv
from newsapi import NewsApiClient
from urllib.parse import quote_plus

dotenv.load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for extension communication

API_KEY = os.getenv("GOOGLE_FACT_CHECK_API_KEY")
NEWS_API_KEY = os.getenv("NEWS_API_KEY")

# Error handling for missing keys
if not all([API_KEY, NEWS_API_KEY]):
    raise EnvironmentError("Missing required API keys in environment variables")

try:
    classifier = pipeline("text-classification", model="jy46604790/Fake-News-Bert-Detect")
except Exception as e:
    raise RuntimeError(f"Model loading failed: {str(e)}")

newsapi = NewsApiClient(api_key=NEWS_API_KEY)

def sanitize_query(query):
    return quote_plus(query.strip()[:500])  # Limit query length for API safety

@app.route("/check", methods=["POST"])
def check():
    data = request.get_json()
    if not data or "text" not in data or len(data["text"]) < 10:
        return jsonify({"error": "Valid text required (min 10 characters)"}), 400

    try:
        text = data["text"][:1000]  # Limit input size
        result = classifier(text)
        fact_check_result = fact_check(text)
        
        return jsonify({
            "label": result[0]["label"],
            "score": round(result[0]["score"], 4),
            "fact_check": fact_check_result
        })
    except Exception as e:
        return jsonify({"error": f"Processing error: {str(e)}"}), 500

def fact_check(query):
    try:
        response = requests.get(
            "https://factchecktools.googleapis.com/v1alpha1/claims:search",
            params={"query": query[:500], "pageSize": 3},  # Limit results
            headers={"X-Goog-Api-Key": API_KEY}
        )
        response.raise_for_status()
        
        claims = response.json().get("claims", [])
        return [
            {
                "title": claim.get("text", ""),
                "source": claim.get("claimReview", [{}])[0].get("publisher", {}).get("name", "Unknown"),
                "url": claim.get("claimReview", [{}])[0].get("url", "")
            }
            for claim in claims if claim.get("claimReview")
        ][:3]  # Return top 3 claims

    except requests.exceptions.RequestException as e:
        return {"error": f"Fact check API error: {str(e)}"}

@app.route("/news", methods=["GET"])
def get_news():
    try:
        query = sanitize_query(request.args.get("query", "news"))
        category = request.args.get("category", "general")
        
        news = newsapi.get_top_headlines(
            q=query,
            category=category,
            language="en",
            country="us",
            page_size=5  # Limit results
        )

        return jsonify({
            "news": [
                {
                    "title": article["title"],
                    "source": article["source"]["name"],
                    "url": article["url"],
                    "fact_check": fact_check(article["title"])
                }
                for article in news.get("articles", [])[:5]  # Limit to 5 articles
            ]
        })
    except Exception as e:
        return jsonify({"error": f"News error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)