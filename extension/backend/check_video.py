from flask import Flask, request, jsonify
import os
from transformers import pipeline
from transformers.pipelines.base import PipelineException

app = Flask(__name__)

# Initialize the video classification pipeline
pipe = pipeline("video-classification", model="shylhy/videomae-large-finetuned-deepfake-subset", use_fast=True)

@app.route('/analyze-video', methods=['POST'])
def analyze_video():
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided."}), 400

    video_file = request.files['video']
    video_path = os.path.join("temp_video.mp4")
    video_file.save(video_path)

    try:
        # Perform video classification
        result = pipe(video_path)

        # Format the result for casual readability
        formatted_result = (
            f"Real: {result[0]['score'] * 100:.1f}% confident\n"
            f"Deepfake: {result[1]['score'] * 100:.1f}% confident"
        )

        return formatted_result
    except PipelineException as e:
        return jsonify({"error": "Pipeline error: " + str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        # Ensure the temporary video file is deleted after processing
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
        except PermissionError as e:
            print(f"Error cleaning up the temporary video file: {e}")

if __name__ == '__main__':
    app.run(debug=True, port=5009)