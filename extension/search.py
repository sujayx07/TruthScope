# pip install requests
import requests

def search_google(query):
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
        print("Search Results:")
        print(response.text)
    else:
        print(f"Error {response.status_code}: {response.text}")

# Example usage:
user_input = input("Enter your search query: ")
search_google(user_input)