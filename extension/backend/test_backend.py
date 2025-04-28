import requests
import json

# Define the server URL
server_url = "http://localhost:5000/analyze"

# Sample article for testing - using a BBC article about climate change
demo_url = "https://www.bbc.com/news/science-environment-65621896"
demo_article_text = """
Climate change: Carbon 'surge' expected in 2023 as extreme heat hits soil
By Matt McGrath
Environment correspondent

Rising temperatures will cause soils to release more carbon dioxide this year, giving a "turbo boost" to global warming, scientists say.

The impact of this carbon "surge" will be equivalent to the annual emissions of Japan, the world's fifth largest polluter.

The situation is likely to be so bad that it would cancel out any rise in carbon uptake by trees and plants, researchers believe.

This would put greater pressure on society to curb fossil fuel use.

Soil is one of the great unknowns in our understanding of future climate change. Earth's soil holds around double the amount of carbon found in the atmosphere.

As temperatures rise, the microbes in the soil become more active and release more CO2 through respiration.
Evidence suggests that this effect increases until temperatures hit around 25C, before declining.

Until now, many scientists believed that the negative impact of soils would be balanced out by the positive impact of plants, which absorb more CO2 when temperatures are higher.

But this new study suggests that in the warming world, in 2023, this balancing act is no more.

Last year was one of the warmest on record and the trend is continuing this year with April setting a new global record.

"What we've seen is that this soil-carbon feedback is sitting in the background affecting the climate, and now the climate is warming enough that it's really expressing itself," lead author Dr Chris Huntingford, from the UK Centre for Ecology and Hydrology (UKCEH), told BBC News.

"And we think this year could be particularly extreme."

According to the analysis, in 2023 these soil carbon losses may well become larger than carbon gains elsewhere, especially in plants.

The researchers used data on soil temperatures and changes in CO2 concentrations to build a mathematical model to predict changes in soil carbon.

They found that in the early 1990s, the soil carbon response to warming was low. But they saw that in the hot years 2015-2016, and again in 2021-2022, there was a surge in the amount of CO2 given off.
"""

# Prepare the request payload
payload = {
    "url": demo_url,
    "article_text": demo_article_text
}

print("Sending test request to backend server...")
try:
    # Send the request
    response = requests.post(server_url, json=payload)
    
    # Check if the request was successful
    if response.status_code == 200:
        result = response.json()
        print("\n=== Analysis Successful ===")
        print(f"Status Code: {response.status_code}")
        print("\nAnalysis Result:")
        print(json.dumps(result, indent=2))  # Pretty print the JSON response
    else:
        print(f"\n=== Analysis Failed ===")
        print(f"Status Code: {response.status_code}")
        print(f"Error: {response.text}")
        
except Exception as e:
    print(f"\n=== Request Error ===")
    print(f"Error: {e}")
    print("\nPlease make sure the backend server is running at http://localhost:5000")