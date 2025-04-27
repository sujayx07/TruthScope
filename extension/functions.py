import os
import requests
from flask import jsonify
from urllib.parse import quote_plus
from newsapi import NewsApiClient
import pymongo
from urllib.parse import urlparse

# Function: sanitize_query
def sanitize_query(query):
    """
    Sanitizes a query string for use in API requests.
    - Trims whitespace from the beginning and end of the query.
    - Limits the query length to 500 characters for API safety.
    - URL-encodes the query to ensure it is properly formatted for use in a URL.
    """
    return quote_plus(query.strip()[:500])

# Function: fact_check
def fact_check(query):
    """
    Performs a fact check on a given query using the Google Fact Check Tools API.
    - Sends a request to the Fact Check Tools API with the query.
    - Limits the query length to 500 characters.
    - Retrieves a maximum of 3 claims from the API response.
    - Returns a list of dictionaries, where each dictionary contains the title, source, and URL of a claim.
    """
    API_KEY = os.getenv("GOOGLE_FACT_CHECK_API_KEY")
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

# Function: get_news
def get_news(query, category):
    """
    Retrieves top news headlines based on a query and category using the NewsAPI.
    - Sanitizes the query using the sanitize_query function.
    - Sends a request to the NewsAPI with the query, category, language, and country.
    - Retrieves a maximum of 5 articles from the API response.
    - Returns a list of dictionaries, where each dictionary contains the title, source, URL, and fact-check results for each article.
    """
    NEWS_API_KEY = os.getenv("NEWS_API_KEY")
    newsapi = NewsApiClient(api_key=NEWS_API_KEY)
    try:
        query = sanitize_query(query)
        
        news = newsapi.get_top_headlines(
            q=query,
            category=category,
            language="en",
            country="us",
            page_size=5  # Limit results
        )

        return [
            {
                "title": article["title"],
                "source": article["source"]["name"],
                "url": article["url"],
            }
            for article in news.get("articles", [])[:5]  # Limit to 5 articles
        ]
    except Exception as e:
        return {"error": f"News error: {str(e)}"}

# Function: search_google
def search_google(query):
    """
    Searches Google using the ZenRows API.
    - Takes a search query as input.
    - Encodes the query to be URL-safe.
    - Sends a request to the ZenRows API with the encoded query and API key.
    - Prints the search results or an error message.
    """
    apikey = 'e94315ba0a74e19239dc6260530b827dc185e960'
    base_url = 'https://serp.api.zenrows.com/v1/targets/google/search/'

    # Encode the query to safely include it in the URL
    from urllib.parse import quote
    encoded_query = quote(query)

    url = f'{base_url}{encoded_query}'
    params = {
        'apikey': apikey,
    }

    response = requests.get(url, params=params)
    
    if response.status_code == 200:
        return response.text
    else:
        return f"Error {response.status_code}: {response.text}"

# Function: is_url_credible
def is_url_credible(url_to_check):
    """
    Checks if a URL is credible by searching for its domain in the database.
    - Extracts the domain from the URL.
    - Searches for the domain in the 'Truthdb' collection.
    - Returns True if the domain is found, False otherwise.
    """
    mongodb_uri = os.getenv("MONGODB_URI")
    db_name = 'Truthdb'

    client = pymongo.MongoClient(mongodb_uri)
    try:
        db = client[db_name]
        collection = db['Truthdb']

        domain = extract_domain_from_url(url_to_check)
        if not domain:
            print('⚠️ Could not extract domain.')
            return False

        result = collection.find_one({'domain': {'$regex': f'^{domain}$', '$options': 'i'}})

        if result:
            print(f'🔎 Domain found in database: {domain}')
            print(f'🗂️ Organization: {result["organization"]}')
            return True
        else:
            print(f'⚠️ Domain NOT found in database: {domain}')
            return False
    except Exception as e:
        print(f"Error during database operation: {e}")
        return False
    finally:
        client.close()

# Function: extract_domain_from_url
def extract_domain_from_url(url):
    """
    Extracts the domain from a URL.
    - Parses the URL using urllib.parse.urlparse.
    - Returns the hostname in lowercase, removing 'www.' if present.
    """
    try:
        parsed_url = urlparse(url)
        domain = parsed_url.hostname
        if domain and domain.startswith('www.'):
            domain = domain[4:]
        return domain.lower()
    except Exception as e:
        print(f"Error extracting domain: {e}")
        return None
