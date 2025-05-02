import unittest
import requests
import json
import os

# --- Configuration ---
# Replace with your actual backend URLs if different
TEXT_BACKEND_URL = os.getenv("TEXT_BACKEND_URL", "http://localhost:5000")
MEDIA_BACKEND_URL = os.getenv("MEDIA_BACKEND_URL", "http://localhost:3000")

# !!! IMPORTANT: Replace with a valid Google Access Token for testing !!!
# You can obtain one by signing in with a test Google account in your extension
# and copying the token from the network requests (e.g., in browser dev tools).
# This token will expire, so you might need to refresh it periodically.
TEST_ACCESS_TOKEN = "YOUR_TEST_ACCESS_TOKEN"

# Sample data for testing
SAMPLE_TEXT_URL = "https://www.bbc.com/news/science-environment-60000000" # Example URL
SAMPLE_TEXT_CONTENT = "This is sample article text about a recent event."
SAMPLE_IMAGE_URL = "https://via.placeholder.com/150.png" # Example image URL
SAMPLE_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4" # Example video URL
SAMPLE_AUDIO_URL = "https://www.w3schools.com/html/horse.mp3" # Example audio URL

class BackendTests(unittest.TestCase):

    def setUp(self):
        """Set up test variables."""
        self.text_analyze_url = f"{TEXT_BACKEND_URL}/analyze"
        self.media_image_url = f"{MEDIA_BACKEND_URL}/analyze_image"
        self.media_video_url = f"{MEDIA_BACKEND_URL}/analyze_video"
        self.media_audio_url = f"{MEDIA_BACKEND_URL}/analyze_audio"

        if TEST_ACCESS_TOKEN == "YOUR_TEST_ACCESS_TOKEN":
            print("\nWARNING: TEST_ACCESS_TOKEN is not set. Authentication tests will likely fail.")
            self.headers = {"Content-Type": "application/json"}
        else:
            self.headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {TEST_ACCESS_TOKEN}"
            }

    def test_01_analyze_text_success(self):
        """Test successful text analysis request.
        Requires a valid TEST_ACCESS_TOKEN.
        """
        print(f"\nTesting POST {self.text_analyze_url} (Text Analysis - Expect Success)")
        payload = {
            "url": SAMPLE_TEXT_URL,
            "article_text": SAMPLE_TEXT_CONTENT
        }
        try:
            response = requests.post(self.text_analyze_url, headers=self.headers, json=payload, timeout=30)
            print(f"Status Code: {response.status_code}")
            # Expect 200 OK for successful analysis
            self.assertEqual(response.status_code, 200, f"Expected 200 OK, got {response.status_code}. Response: {response.text}")
            result = response.json()
            self.assertIn("textResult", result, "Response JSON should contain 'textResult'")
            print("Result snippet:", json.dumps(result.get("textResult", {}).get("reasoning", "N/A"), indent=2))
        except requests.exceptions.RequestException as e:
            self.fail(f"Request failed: {e}")

    def test_02_analyze_text_auth_fail(self):
        """Test text analysis request with missing/invalid auth header."""
        print(f"\nTesting POST {self.text_analyze_url} (Text Analysis - Expect 401 Auth Error)")
        payload = {
            "url": SAMPLE_TEXT_URL,
            "article_text": SAMPLE_TEXT_CONTENT
        }
        # Use headers without Authorization
        invalid_headers = {"Content-Type": "application/json"}
        try:
            response = requests.post(self.text_analyze_url, headers=invalid_headers, json=payload, timeout=10)
            print(f"Status Code: {response.status_code}")
            # Expect 401 Unauthorized
            self.assertEqual(response.status_code, 401, f"Expected 401 Unauthorized, got {response.status_code}. Response: {response.text}")
            result = response.json()
            self.assertIn("error", result, "Error response should contain 'error' key")
            print("Error message:", result.get("error"))
        except requests.exceptions.RequestException as e:
            self.fail(f"Request failed: {e}")

    def test_03_analyze_image_success(self):
        """Test successful image analysis request (currently public, no auth needed)."""
        print(f"\nTesting POST {self.media_image_url} (Image Analysis - Expect Success)")
        payload = {"media_url": SAMPLE_IMAGE_URL}
        # Image endpoint might not require auth currently, use basic headers
        basic_headers = {"Content-Type": "application/json"}
        try:
            response = requests.post(self.media_image_url, headers=basic_headers, json=payload, timeout=20)
            print(f"Status Code: {response.status_code}")
            # Expect 200 OK
            self.assertEqual(response.status_code, 200, f"Expected 200 OK, got {response.status_code}. Response: {response.text}")
            result = response.json()
            self.assertIn("status", result, "Response JSON should contain 'status'")
            print("Result snippet:", json.dumps(result.get("analysis_summary", "N/A"), indent=2))
        except requests.exceptions.RequestException as e:
            self.fail(f"Request failed: {e}")

    def test_04_analyze_video_auth_or_success(self):
        """Test video analysis request.
        Expects 200 OK if token is valid AND user has 'paid' tier.
        Expects 403 Forbidden if token is valid but user tier is 'free'.
        Expects 401 Unauthorized if token is invalid/missing.
        """
        print(f"\nTesting POST {self.media_video_url} (Video Analysis - Expect 200, 401, or 403)")
        payload = {"media_url": SAMPLE_VIDEO_URL}
        try:
            response = requests.post(self.media_video_url, headers=self.headers, json=payload, timeout=45) # Longer timeout for video
            print(f"Status Code: {response.status_code}")
            # Check for expected outcomes
            self.assertIn(response.status_code, [200, 401, 403],
                          f"Expected 200, 401, or 403, but got {response.status_code}. Response: {response.text}")
            result = response.json()
            if response.status_code == 200:
                self.assertIn("status", result, "Successful response JSON should contain 'status'")
                print("Result snippet:", json.dumps(result.get("analysis_summary", "N/A"), indent=2))
            else: # 401 or 403
                self.assertIn("error", result, "Error response should contain 'error' key")
                print("Error message:", result.get("error"))
        except requests.exceptions.RequestException as e:
            self.fail(f"Request failed: {e}")

    def test_05_analyze_audio_auth_or_success(self):
        """Test audio analysis request.
        Expects 200 OK if token is valid AND user has 'paid' tier.
        Expects 403 Forbidden if token is valid but user tier is 'free'.
        Expects 401 Unauthorized if token is invalid/missing.
        """
        print(f"\nTesting POST {self.media_audio_url} (Audio Analysis - Expect 200, 401, or 403)")
        payload = {"media_url": SAMPLE_AUDIO_URL}
        try:
            response = requests.post(self.media_audio_url, headers=self.headers, json=payload, timeout=30)
            print(f"Status Code: {response.status_code}")
            # Check for expected outcomes
            self.assertIn(response.status_code, [200, 401, 403],
                          f"Expected 200, 401, or 403, but got {response.status_code}. Response: {response.text}")
            result = response.json()
            if response.status_code == 200:
                self.assertIn("status", result, "Successful response JSON should contain 'status'")
                print("Result snippet:", json.dumps(result.get("analysis_summary", "N/A"), indent=2))
            else: # 401 or 403
                self.assertIn("error", result, "Error response should contain 'error' key")
                print("Error message:", result.get("error"))
        except requests.exceptions.RequestException as e:
            self.fail(f"Request failed: {e}")

if __name__ == '__main__':
    print("Starting backend tests...")
    print(f"Text Backend URL: {TEXT_BACKEND_URL}")
    print(f"Media Backend URL: {MEDIA_BACKEND_URL}")
    print("Make sure both backend servers (check_text.py and check_media.py) are running.")
    print("Also ensure TEST_ACCESS_TOKEN is set correctly in test_backend.py for authenticated tests.")
    unittest.main()