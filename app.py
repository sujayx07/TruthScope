from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for cross-origin requests

@app.route("/analyze-text", methods=["POST"])
def analyze_text():
    data = request.get_json()
    text = data.get("text", "")
    print(data)

    # Simple placeholder logic for misinformation detection
    is_misinformation = "fake news" in text.lower()

    return jsonify({"isMisinformation": is_misinformation})

if __name__ == "__main__":
    app.run(port=5000)
