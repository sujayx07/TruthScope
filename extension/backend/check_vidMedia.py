import requests
url = "https://ping.arya.ai/api/v1/deepfake-detection/video"
payload = {"doc_base64": "< base64 string of image / video >", "req_id": '< req id string >', "isIOS": '< boolean >', "doc_type": '< string (video/image) >', "orientation":  '< int >',  }
headers = {
  'token': 'ca77aac9f7603d91f325ecb54985ae17',
  'content-type':'application/json'
}
response = requests.request("POST", url, json=payload, headers=headers)
print(response.text)