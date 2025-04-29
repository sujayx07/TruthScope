import requests
import json

def extract_text_from_image(image_url: str) -> dict:
    """
    Extracts text from an image using the OCR.space API.

    Args:
        image_url (str): The URL of the image.

    Returns:
        dict: The response from the OCR.space API containing extracted text and metadata.
    """
    api_key = "K85699750588957"
    api_url = "https://api.ocr.space/parse/imageurl"

    payload = {"apikey": api_key, "url": image_url, "language": "eng"}

    try:
        response = requests.get(api_url, params=payload)  # Changed to GET request
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"error": f"Request failed: {e}"}
    except json.JSONDecodeError as e:
        return {"error": f"Failed to decode JSON response: {e}"}

if __name__ == "__main__":
    # Example usage
    image_url = "https://theelearningcoach.com/wp-content/uploads/2017/01/text-image-title.png"  # Replace with your image URL
    result = extract_text_from_image(image_url)
    print(json.dumps(result, indent=4))