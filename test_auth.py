import requests, jwt, os
from dotenv import load_dotenv
from colorama import Fore
from turnstile import get_turnstile_token

# Load environment variables from .env file
load_dotenv()

# Read values from the environment
mobile_number = os.getenv("MOBILE_NUMBER")
password = os.getenv("PASSWORD")

# Function to fetch auth token dynamically
def fetch_auth_token(mobile_number, password):
    login_url = "https://railspaapi.shohoz.com/v1.0/app/auth/sign-in"

    # First get the turnstile token via browser automation
    turnstile_token = get_turnstile_token()

    payload = {
        "mobile_number": mobile_number,
        "password": password,
    }

    if turnstile_token:
        payload["cft_response"] = turnstile_token

    try:
        response = requests.post(login_url, json=payload)
        print(f"Auth Response Status: {response.status_code}")
        print(f"Auth Response Body: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("data", {}).get("token", "")
            
            if token:
                print(f"{Fore.GREEN}Authentication successful!")
                return token
            else:
                print(f"{Fore.RED}Failed to extract token from the response: {data}")
                return None
                
        elif response.status_code == 422:
            error_data = response.json()
            error_msg = error_data.get("error", {}).get("messages", "")
            
            if isinstance(error_msg, dict) and error_msg.get("error_msg"):
                print(f"{Fore.RED}Authentication failed: {error_msg.get('error_msg')}")
            else:
                print(f"{Fore.RED}Authentication failed with error: {error_msg}")
            
            return None
            
        else:
            print(f"{Fore.RED}Authentication failed with status code: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"{Fore.RED}An error occurred: {e}")
        return None

def extract_user_info_from_token(auth_key):
    try:
        # Decode the JWT token without verifying the signature (as secret key is unknown)
        decoded_token = jwt.decode(auth_key, options={"verify_signature": False}, algorithms=["RS256"])
        
        # Extract relevant fields and print the entire token for debugging
        print(f"\nDecoded token contents:")
        for key, value in decoded_token.items():
            print(f"{key}: {value}")
        
        # Extract specific fields we need
        user_email = decoded_token.get("email", "")
        user_phone = decoded_token.get("phone_number", "") or decoded_token.get("username", "")
        user_name = decoded_token.get("display_name", "")
        
        print(f"\nExtracted user info:")
        print(f"Email: {user_email}")
        print(f"Phone: {user_phone}")
        print(f"Name: {user_name}")
        
        return user_email, user_phone, user_name
        
    except Exception as e:
        print(f"{Fore.RED}Failed to decode auth token: {e}")
        return None, None, None

# Run the test
if __name__ == "__main__":
    print("Testing authentication and token extraction...")
    
    # Step 1: Authenticate user and fetch authorization token
    auth_key = fetch_auth_token(mobile_number, password)
    
    # Step 2: Extract user info from token if authentication was successful
    if auth_key:
        user_email, user_phone, user_name = extract_user_info_from_token(auth_key)
        print(f"\nFinal extracted values:")
        print(f"Email: {user_email}")
        print(f"Phone: {user_phone}")
        print(f"Name: {user_name}")
    else:
        print("Authentication failed. Cannot extract user info.")
