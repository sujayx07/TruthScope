from openai import OpenAI

client = OpenAI(
    base_url="https://api.aimlapi.com/v1",
    api_key="7f99cf79e09e43e082c357c9c9dc6eaf",    
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "what is the score of kkr vs pbks"}]
)

print(response.choices[0].message.content)