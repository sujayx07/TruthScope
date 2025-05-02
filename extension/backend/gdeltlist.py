from gdeltdoc import GdeltDoc, Filters
from datetime import datetime, timedelta
import json

# Get the current date
current_date = datetime.now()
# Set the start date to 7 days before the current date
start_date = (current_date - timedelta(days=7)).strftime('%Y-%m-%d')
# Set the end date to the current date
end_date = current_date.strftime('%Y-%m-%d')

f = Filters(
    keyword="Indian News",
    start_date=start_date,
    end_date=end_date
)

# Debugging: Print the filters to verify their values
print("Filters:", f)

gd = GdeltDoc()

# Search for articles matching the filters
articles = gd.article_search(f)

# Debugging: Check if articles are returned
if articles is not None and not articles.empty:
    print("Articles found:", articles)
else:
    print("No articles found.")

# Debugging: Print the entire articles data
if articles is not None:
    print("Full Articles Data:")
    print(articles)
else:
    print("No articles data available.")

# Debugging: Save the entire articles data as JSON
if articles is not None:
    articles_json = articles.to_json(orient='records')
    print("Full Articles Data in JSON:")
    print(articles_json)
else:
    print("No articles data available.")

# Get a timeline of the number of articles matching the filters
timeline = gd.timeline_search("timelinevol", f)

# Debugging: Check if timeline data is returned
if timeline is not None and not timeline.empty:
    print("Timeline data:", timeline)
else:
    print("No timeline data found.")

# Debugging: Print the entire timeline data
if timeline is not None:
    print("Full Timeline Data:")
    print(timeline)
else:
    print("No timeline data available.")

# Debugging: Save the entire timeline data as JSON
if timeline is not None:
    timeline_json = timeline.to_json(orient='records')
    print("Full Timeline Data in JSON:")
    print(timeline_json)
else:
    print("No timeline data available.")