from playwright.sync_api import sync_playwright
import time
from colorama import Fore

def get_turnstile_token():
    """
    Opens a browser using Playwright, navigates to the Bangladesh Railway E-ticketing login page,
    waits for the Cloudflare Turnstile token to be generated, and returns it.
    """
    print(f"{Fore.YELLOW}Opening browser to fetch Turnstile token... Please wait. Do not close the browser.")
    try:
        with sync_playwright() as p:
            # We launch headless=False so that the user can pass the Cloudflare Turnstile check if needed
            browser = p.chromium.launch(headless=False)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={'width': 1280, 'height': 800}
            )
            page = context.new_page()

            page.goto("https://eticket.railway.gov.bd/login/en")

            print(f"{Fore.CYAN}Waiting for Turnstile response. This may take a few seconds...")

            # Wait for the cf-turnstile-response hidden input to exist in the DOM
            page.wait_for_selector("[name='cf-turnstile-response']", state="attached", timeout=60000)

            # Wait for the input to actually have a value (it gets populated once Turnstile verification succeeds)
            page.wait_for_function(
                "() => { const el = document.querySelector('[name=\"cf-turnstile-response\"]'); return el && el.value !== ''; }",
                timeout=60000
            )

            # Extract the token
            token = page.locator("[name='cf-turnstile-response']").input_value()

            print(f"{Fore.GREEN}Successfully extracted Turnstile token!")
            browser.close()
            return token

    except Exception as e:
        print(f"{Fore.RED}Failed to get Turnstile token via browser: {e}")
        return None
