import requests, jwt, os, time, json, subprocess
from dotenv import load_dotenv
from colorama import Fore

load_dotenv()

mobile_number = os.getenv("MOBILE_NUMBER")
password = os.getenv("PASSWORD")

BASE_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Railway/1.0 (Android 13; Samsung SM-A536E)",
    "X-App-Version": "2.1.0",
    "X-Device-Id": "test-device-123456"
}

def fetch_auth_token_from_chrome():
    import urllib.request
    import websocket
    
    print(f"{Fore.YELLOW}Connecting to Chrome at localhost:9222...")
    
    ws_url = None
    for attempt in range(5):
        try:
            req = urllib.request.Request('http://localhost:9222/json')
            with urllib.request.urlopen(req, timeout=5) as response:
                browsers = json.loads(response.read())
                for browser in browsers:
                    if browser.get('type') == 'page' and 'eticket.railway.gov.bd' in browser.get('url', ''):
                        ws_url = browser.get('webSocketDebuggerUrl')
                        break
                if not ws_url:
                    for browser in browsers:
                        if browser.get('type') == 'page':
                            ws_url = browser.get('webSocketDebuggerUrl')
                            break
                if ws_url:
                    break
        except Exception as e:
            print(f"Attempt {attempt + 1}: {e}")
        time.sleep(1)
    
    if not ws_url:
        print(f"{Fore.RED}Could not connect to Chrome")
        return None
    
    print(f"{Fore.GREEN}Connected! Getting localStorage...")
    
    try:
        ws = websocket.create_connection(ws_url, timeout=10)
        ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": "JSON.stringify(localStorage)"}}))
        result = ws.recv()
        ws.close()
        
        data = json.loads(result)
        local_storage_str = data.get('result', {}).get('result', {}).get('value', '{}')
        local_storage = json.loads(local_storage_str)
        
        print(f"{Fore.CYAN}LocalStorage keys: {list(local_storage.keys())}")
        
        token = local_storage.get('token')
        if token:
            print(f"{Fore.GREEN}JWT Token found!")
            return token
        
        print(f"{Fore.RED}No token found")
        return None
        
    except Exception as e:
        print(f"{Fore.RED}Error: {e}")
        return None

def extract_user_info_from_token(auth_key):
    try:
        decoded_token = jwt.decode(auth_key, options={"verify_signature": False}, algorithms=["RS256"])
        
        print(f"\nDecoded token contents:")
        for key, value in decoded_token.items():
            print(f"{key}: {value}")
        
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

if __name__ == "__main__":
    print("Testing authentication and token extraction...")
    
    auth_key = fetch_auth_token_from_chrome()
    
    if auth_key:
        user_email, user_phone, user_name = extract_user_info_from_token(auth_key)
        print(f"\nFinal extracted values:")
        print(f"Email: {user_email}")
        print(f"Phone: {user_phone}")
        print(f"Name: {user_name}")
    else:
        print("Authentication failed.")