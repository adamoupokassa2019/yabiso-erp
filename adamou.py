import os
from dotenv import load_dotenv
from openai import OpenAI

# Charger la clé depuis .env
load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(api_key=api_key)

print("=" * 50)
print("🤖 Bonjour, je suis Adamou.")
print("Ton assistant IA est maintenant connecté.")
print("Écris 'quitter' pour arrêter.")
print("=" * 50)

while True:
    question = input("\nToi : ")

    if question.lower() == "quitter":
        print("Adamou : À bientôt !")
        break

    try:
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": "Tu es Adamou, un assistant personnel intelligent, professionnel et utile."
                },
                {
                    "role": "user",
                    "content": question
                }
            ]
        )

        answer = response.choices[0].message.content
        print("\nAdamou :", answer)

    except Exception as e:
        print("\nErreur :", e)