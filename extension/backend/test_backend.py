import requests
import json

# Define the server URL
server_url = "http://localhost:5000/analyze"

# Sample article for testing - using a BBC article about climate change
demo_url = "https://timesofindia.indiatimes.com/world/europe/massive-blackout-hits-spain-portugal-france-trains-flights-affected-millions-impacted/articleshow/120697350.cms"
demo_article_text = """
NEW DELHI: On the eve of Kolkata Knight Riders' crucial Indian Premier League match against Delhi Capitals at the Arun Jaitley Stadium, pacer Harshit Rana admitted on Monday that the defending champions deeply miss the presence of former mentor Gautam Gambhir in their dugout.
Also visit: IPL Live Score
Rana, who had a breakout IPL 2024 season under Gambhir's guidance — taking 19 wickets in KKR's title-winning run — revealed how much the 'Guru' meant to his development. Thanks to Gambhir's mentorship, Harshit has since made his India debut across all three formats and emerged as one of the country's brightest young pace prospects.
Go Beyond The Boundary with our YouTube channel. SUBSCRIBE NOW!
Asked if KKR missed Gambhir, Harshit said diplomatically: "I won't say that because the composition of our support staff is basically the same (from last year). (Abhishek) Nayar Bhai has also come back. Chandu Sir, (Dwayne) Bravo are all good. But yes, there is this thrill factor which I miss a little. I am not talking about anyone else."
Who's that IPL player?
Rana then added: "You also know that Gambhir has an aura, the way he comes and takes the team along. I was just talking about that."
Poll
Do you think KKR is missing Gautam Gambhir's mentorship this season?
Maybe a littleNot sureNo, they have a strong support staffYes, definitely
Abhishek Nayar, who returned to KKR's coaching group after a stint with the Indian team, is seen by Rana as a major positive. "There will be a lot of changes now that he (Nayar) has come back. He is a very smart mind and reads situations very well," Rana said.
With just seven points so far this season, KKR are struggling at seventh in the table, and Rana's candid comments reflect a side trying to rediscover the magic touch that once propelled them to glory.
author
About the Author
TOI Sports Desk
The TOI Sports Desk excels in a myriad of roles that capture the essence of live sporting events and deliver compelling content to readers worldwide. From running live blogs for India and non-India cricket matches to global spectacles featuring Indian talents, like the Chess World Cup final featuring Praggnanandhaa and the Badminton World Championships semifinal featuring HS Prannoy, our live coverage extends to all mega sporting events. We extensively cover events like the Olympics, Asian Games, Cricket World Cups, FIFA World Cups, and more. The desk is also adept at writing comprehensive match reports and insightful post-match commentary, complemented by stats-based articles that provide an in-depth analysis of player performances and team dynamics. We track news wires for key stories, conduct exclusive player interviews in both text and video formats, and file content from print editions and reporters. We keep track of all viral stories, trending topics and produce our own copies on the subjects. We deliver accurate, engaging, and up-to-the-minute sports content, round the clock.Read More


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