from flask import Flask, request, jsonify
from flask_cors import CORS
from google.generativeai import configure, GenerativeModel, GenerationConfig

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for cross-origin requests

# Configure Gemini model
configure(api_key= "AIzaSyCQwe4JPxSXBClUJ_h8Dylm5GaC3U39i-w")
model = GenerativeModel('gemini-1.5-flash')

generation_config = GenerationConfig(
    temperature=0.7,
    max_output_tokens=200
)

@app.route("/analyze-text", methods=["POST"])
def analyze_text():
    data = request.get_json()
    text = data.get("text", "")
    print(f"User Input: {text}")

    # Create the prompt for Gemini
    prompt = [
        f"""
        You are an AI news classifier designed to determine whether a given news statement is Real or Fake based on available knowledge. The user may be vague, so interpret their query in the most relevant way possible.

        Instructions:

        Classify the news as either Real or Fake.
        If Fake, provide a short factual correction or clarification (1-2 sentences) explaining why it is incorrect.
        Keep responses concise and direct (no unnecessary explanations).
        Example Output:

        Real
        Fake: The claim is false because [brief fact].
        Additional Guidelines:

        If unsure, classify as Fake and provide the best-known factual correction.
        Here is the user's request: {text}
        """
    ]

    # Get the Gemini response
    try:
        response = model.generate_content(prompt, generation_config=generation_config)
        gemini_result = response.text
        print(f"Gemini Response: {gemini_result}")
    except Exception as e:
        gemini_result = f"Error: {str(e)}"
        print(f"Gemini Error: {gemini_result}")

    return jsonify({"geminiResult": gemini_result})

if __name__ == "__main__":
    app.run(port=5000)