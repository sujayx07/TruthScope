# this example uses requests
import requests
import json

params = {
  'url': 'https://i.ytimg.com/vi/hfqQwro1OqE/maxresdefault.jpg',
  'models': 'genai',
  'api_user': '99030650',
  'api_secret': 'rUSbX3YpAnSeWr2GRqpfRqYaJr8HFhdh'
}
r = requests.get('https://api.sightengine.com/1.0/check.json', params=params)

output = json.loads(r.text)
print(json.dumps(output, indent=2))
print("Status: ", output['status'])