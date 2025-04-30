import requests
import json
import base64

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

if __name__ == "__main__":
    main()