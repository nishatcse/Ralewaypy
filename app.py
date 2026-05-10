import requests, time, jwt, os, asyncio, re, json
import urllib.request, urllib.parse
import subprocess, shutil, signal
import websocket
from dotenv import load_dotenv
from colorama import Fore

load_dotenv()

from_city = os.getenv("FROM_CITY")
to_city = os.getenv("TO_CITY")
date_of_journey = os.getenv("DATE_OF_JOURNEY")
seat_class = os.getenv("SEAT_CLASS")
train_number = int(os.getenv("TRAIN_NUMBER"))
max_selectable_seat = int(os.getenv("MAX_SELECTABLE_SEAT"))
desired_seats = os.getenv("DESIRED_SEATS").split(',') if os.getenv("DESIRED_SEATS") else []
mobile_number = os.getenv("MOBILE_NUMBER")
password = os.getenv("PASSWORD")

API_BASE = "https://railspaapi.shohoz.com"
trip_id = trip_route_id = boarding_point_id = train_name = None

# --- Cached state to avoid redundant WebSocket connections ---
_cached_ws_url = None
_cached_ws_url_time = 0
_cached_auth = None
_cached_auth_time = 0
_cached_turnstile = None
_cached_turnstile_time = 0

WS_URL_TTL = 30        # Re-discover Chrome WS URL every 30s
AUTH_TTL = 120          # Re-read auth from localStorage every 2 min
TURNSTILE_TTL = 45      # Re-read turnstile token every 45s (they expire)


def get_ws_url(force=False):
    global _cached_ws_url, _cached_ws_url_time
    now = time.time()
    if not force and _cached_ws_url and (now - _cached_ws_url_time) < WS_URL_TTL:
        return _cached_ws_url

    for attempt in range(5):
        try:
            req = urllib.request.Request('http://localhost:9222/json')
            with urllib.request.urlopen(req, timeout=5) as response:
                browsers = json.loads(response.read())
                # Prefer the eticket page
                for browser in browsers:
                    if browser.get('type') == 'page' and 'eticket.railway.gov.bd' in browser.get('url', ''):
                        _cached_ws_url = browser.get('webSocketDebuggerUrl')
                        _cached_ws_url_time = now
                        return _cached_ws_url
                # Fallback to any page
                for browser in browsers:
                    if browser.get('type') == 'page':
                        _cached_ws_url = browser.get('webSocketDebuggerUrl')
                        _cached_ws_url_time = now
                        return _cached_ws_url
        except:
            pass
        time.sleep(1)
    return None


def exec_js(ws_url, js, await_promise=False, _retries=3):
    for attempt in range(_retries):
        try:
            ws = websocket.create_connection(ws_url, timeout=60)
            params = {"expression": js, "returnByValue": True}
            if await_promise:
                params["awaitPromise"] = True
            ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": params}))
            raw = ws.recv()
            ws.close()
            result = json.loads(raw)
            return result.get('result', {}).get('result', {}).get('value')
        except (ConnectionRefusedError, websocket.WebSocketException, OSError, TimeoutError, ConnectionError) as e:
            if attempt < _retries - 1:
                print(f"{Fore.YELLOW}WS connection failed (attempt {attempt+1}/{_retries}): {e}. Re-discovering Chrome...")
                # Force refresh the WS URL — Chrome may have changed it
                new_url = get_ws_url(force=True)
                if new_url:
                    ws_url = new_url
                time.sleep(1)
            else:
                raise


def get_turnstile_token(ws_url, force=False):
    """Get a fresh Turnstile token. These tokens are SINGLE-USE, so we always
    need a fresh one and must trigger a reset after reading."""
    global _cached_turnstile, _cached_turnstile_time

    # If we have a cached token that hasn't been used yet, return it
    if not force and _cached_turnstile and (time.time() - _cached_turnstile_time) < TURNSTILE_TTL:
        token = _cached_turnstile
        # Mark as used — next call will need a fresh one
        _cached_turnstile = None
        _cached_turnstile_time = 0
        return token

    # Try to get current token from the page
    js = '''(() => {
        const inp = document.querySelector('input[name="cf-turnstile-response"]');
        const token = inp ? inp.value : null;

        // After reading, trigger Turnstile to generate a new token for next use
        if (window.turnstile) {
            try {
                // Reset all Turnstile widgets to regenerate tokens
                const widgets = document.querySelectorAll('[id^="cf-turnstile"]');
                widgets.forEach(w => {
                    try { turnstile.reset(w.id); } catch(e) {}
                });
                // Also try reset without ID (resets first widget)
                try { turnstile.reset(); } catch(e) {}
            } catch(e) {}
        }

        return token;
    })()'''

    token = exec_js(ws_url, js)
    if token:
        return token

    # Token not available — maybe Turnstile hasn't loaded or is regenerating
    # Wait briefly and try once more
    time.sleep(2)
    simple_js = '''(() => {
        const inp = document.querySelector('input[name="cf-turnstile-response"]');
        return inp ? inp.value : null;
    })()'''
    token = exec_js(ws_url, simple_js)
    return token


def get_auth_headers(ws_url, force=False):
    global _cached_auth, _cached_auth_time
    now = time.time()
    if not force and _cached_auth and (now - _cached_auth_time) < AUTH_TTL:
        return _cached_auth

    js = '''(() => {
        const t = localStorage.getItem('token');
        const u = localStorage.getItem('uudid') || '';
        const s = localStorage.getItem('ssdk') || '';
        const uinfo = localStorage.getItem('user');
        return JSON.stringify({token: t, uudid: u, ssdk: s, user: uinfo});
    })()'''
    result = exec_js(ws_url, js)
    if result:
        parsed = json.loads(result)
        if parsed.get('token'):
            _cached_auth = parsed
            _cached_auth_time = now
        return parsed
    return None


def invalidate_turnstile():
    """Force turnstile token refresh on next API call."""
    global _cached_turnstile, _cached_turnstile_time
    _cached_turnstile = None
    _cached_turnstile_time = 0


def api_request(method, path, params=None, json_data=None):
    ws_url = get_ws_url()
    if not ws_url:
        print(f"{Fore.RED}Cannot connect to Chrome. Is it running with --remote-debugging-port=9222?")
        return None

    headers = get_auth_headers(ws_url)
    if not headers or not headers.get('token'):
        print(f"{Fore.RED}No auth token found in Chrome localStorage. Are you logged in?")
        return None

    if params is None:
        params = {}
    cft = get_turnstile_token(ws_url)
    if cft:
        params['cft_response'] = cft

    url = f"{API_BASE}{path}?" + urllib.parse.urlencode(params)

    # Escape single quotes in token values for JS string safety
    token_escaped = headers['token'].replace("'", "\\'")
    uudid_escaped = headers['uudid'].replace("'", "\\'")
    ssdk_escaped = headers['ssdk'].replace("'", "\\'")

    # Check if this endpoint needs the X-Action-Token header
    needs_action_token = any(ep in path for ep in ['reserve-seat', 'release-seat'])

    js = f"""(async () => {{
        const opts = {{
            method: '{method}',
            headers: {{
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer {token_escaped}',
                'x-device-id': '{uudid_escaped}',
                'x-device-key': '{ssdk_escaped}',
                'x-requested-with': 'XMLHttpRequest'
            }}
        }};
        """

    # Add X-Action-Token header for reserve-seat / release-seat
    if needs_action_token:
        js += """
        const actionToken = sessionStorage.getItem('atk') || '';
        if (actionToken) {
            opts.headers['X-Action-Token'] = actionToken;
        }
        """

    if json_data:
        js += f"opts.body = JSON.stringify({json.dumps(json_data)});"

    js += f"""
        try {{
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 45000);
            opts.signal = controller.signal;
            const r = await fetch('{url}', opts);
            clearTimeout(timeout);
            const t = await r.text();

            // Capture X-Action-Token from response and store in sessionStorage
            const actionTokenResp = r.headers.get('X-Action-Token');
            if (actionTokenResp) {{
                sessionStorage.setItem('atk', actionTokenResp);
            }}

            return JSON.stringify({{s: r.status, b: t}});
        }} catch(e) {{
            return JSON.stringify({{s: 0, b: e.message}});
        }}
    }})()"""

    result = exec_js(ws_url, js, await_promise=True)
    try:
        return json.loads(result) if result else None
    except:
        return None


def auto_login_if_needed(ws_url):
    """Check if we're on the login page and auto-submit credentials."""
    # Check current URL
    current_url = exec_js(ws_url, "location.href")
    if not current_url or '/login' not in current_url:
        return  # Not on login page, nothing to do

    print(f"{Fore.YELLOW}Detected login page. Attempting auto-login...")

    # Check if credentials are filled (they're pre-filled from the form)
    has_inputs = exec_js(ws_url, '''(() => {
        const inputs = document.querySelectorAll('input[type="text"], input[type="password"], input[type="tel"]');
        return inputs.length >= 2;
    })()''')

    if not has_inputs:
        print(f"{Fore.RED}Login form not found on page.")
        return

    # Fill credentials from .env if not already filled
    login_js = f'''(async () => {{
        // Find and fill the mobile/username field
        const inputs = document.querySelectorAll('input');
        let mobileField = null;
        let passField = null;
        for (const inp of inputs) {{
            const t = inp.type.toLowerCase();
            const n = (inp.name || '').toLowerCase();
            const p = (inp.placeholder || '').toLowerCase();
            if ((t === 'tel' || t === 'text' || t === 'number') && !mobileField && (n.includes('mobile') || n.includes('phone') || n.includes('user') || p.includes('mobile') || p.includes('phone') || inp.value.match(/^01/))) {{
                mobileField = inp;
            }}
            if (t === 'password') {{
                passField = inp;
            }}
        }}

        if (!mobileField || !passField) {{
            return JSON.stringify({{ok: false, msg: 'Cannot find login fields'}});
        }}

        // Set values using native setter to trigger Angular/React change detection
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(mobileField, '{mobile_number}');
        mobileField.dispatchEvent(new Event('input', {{ bubbles: true }}));
        mobileField.dispatchEvent(new Event('change', {{ bubbles: true }}));

        nativeInputValueSetter.call(passField, '{password}');
        passField.dispatchEvent(new Event('input', {{ bubbles: true }}));
        passField.dispatchEvent(new Event('change', {{ bubbles: true }}));

        // Wait for Cloudflare Turnstile to load and complete verification
        // The challenge widget needs time to render and solve
        let turnstileReady = false;
        for (let i = 0; i < 15; i++) {{
            await new Promise(r => setTimeout(r, 1000));
            const cft = document.querySelector('input[name="cf-turnstile-response"]');
            if (cft && cft.value && cft.value.length > 10) {{
                turnstileReady = true;
                break;
            }}
        }}

        if (!turnstileReady) {{
            return JSON.stringify({{ok: false, msg: 'Cloudflare Turnstile did not load in 15s'}});
        }}

        // Find and click the submit button
        const btns = document.querySelectorAll('button[type="submit"], button.login-btn, button.btn-login, input[type="submit"]');
        let submitBtn = btns.length > 0 ? btns[0] : null;
        if (!submitBtn) {{
            // Fallback: find any button with login text
            const allBtns = document.querySelectorAll('button');
            for (const b of allBtns) {{
                if (b.textContent.toLowerCase().includes('login') || b.textContent.toLowerCase().includes('sign in') || b.textContent.toLowerCase().includes('log in')) {{
                    submitBtn = b;
                    break;
                }}
            }}
        }}

        if (submitBtn) {{
            submitBtn.click();
            return JSON.stringify({{ok: true, msg: 'Login form submitted'}});
        }} else {{
            // Try submitting the form directly
            const form = document.querySelector('form');
            if (form) {{
                form.submit();
                return JSON.stringify({{ok: true, msg: 'Form submitted directly'}});
            }}
            return JSON.stringify({{ok: false, msg: 'No submit button or form found'}});
        }}
    }})()'''

    result = exec_js(ws_url, login_js, await_promise=True)
    if result:
        try:
            data = json.loads(result)
            if data.get('ok'):
                print(f"{Fore.GREEN}{data['msg']}. Waiting for redirect...")
            else:
                print(f"{Fore.RED}Login issue: {data.get('msg')}")
                return
        except:
            print(f"{Fore.YELLOW}Login submitted (raw: {result})")

    # Wait for login to complete — the site may open a new tab or redirect
    for i in range(30):
        time.sleep(1)

        # After login, the WS URL may have changed. Re-discover all tabs.
        new_ws = get_ws_url(force=True)

        # Check ALL page tabs for an eticket page with a token
        try:
            req = urllib.request.Request('http://localhost:9222/json')
            with urllib.request.urlopen(req, timeout=5) as response:
                all_tabs = json.loads(response.read())
        except:
            continue

        for tab in all_tabs:
            if tab.get('type') != 'page':
                continue
            tab_ws = tab.get('webSocketDebuggerUrl')
            tab_url = tab.get('url', '')
            if not tab_ws:
                continue

            # Check if this tab has a token (must be on eticket origin)
            if 'eticket.railway.gov.bd' in tab_url and '/login' not in tab_url:
                try:
                    token = exec_js(tab_ws, "localStorage.getItem('token')")
                    if token:
                        print(f"{Fore.GREEN}Login successful! Token found on: {tab_url}")
                        invalidate_turnstile()
                        global _cached_auth, _cached_auth_time, _cached_ws_url, _cached_ws_url_time
                        _cached_auth = None
                        _cached_auth_time = 0
                        _cached_ws_url = tab_ws
                        _cached_ws_url_time = time.time()
                        return
                except:
                    pass

        # If original tab still exists and has left the login page
        if new_ws:
            try:
                cur = exec_js(new_ws, "location.href")
                if cur and '/login' not in cur:
                    # Logged in but maybe on newtab — navigate to eticket
                    print(f"{Fore.YELLOW}Redirected to: {cur}. Navigating to eticket site...")
                    search_url = f"https://eticket.railway.gov.bd/booking/train/search?fromcity={from_city}&tocity={to_city}&doj={date_of_journey}&class={seat_class}"
                    exec_js(new_ws, f"location.href = '{search_url}'")
                    time.sleep(5)  # Wait for navigation and Angular to load
                    # Re-discover the page
                    _cached_ws_url = None
                    _cached_ws_url_time = 0
                    final_ws = get_ws_url(force=True)
                    if final_ws:
                        token = exec_js(final_ws, "localStorage.getItem('token')")
                        if token:
                            print(f"{Fore.GREEN}Login successful! Token available.")
                            invalidate_turnstile()
                            _cached_auth = None
                            _cached_auth_time = 0
                            return
            except:
                pass

    print(f"{Fore.RED}Login timed out after 30s. Please log in manually.")


def fetch_auth_key():
    ws_url = get_ws_url()
    if not ws_url:
        return None

    # Try to get token first
    js = "localStorage.getItem('token')"
    token = exec_js(ws_url, js)

    if not token:
        # Maybe we're on the login page — try auto-login
        auto_login_if_needed(ws_url)
        # Re-fetch after login
        ws_url = get_ws_url(force=True)
        if ws_url:
            token = exec_js(ws_url, js)

    return token


def extract_user_info_from_token(auth_key):
    try:
        decoded = jwt.decode(auth_key, options={"verify_signature": False}, algorithms=["RS256"])
        print(f"{Fore.CYAN}Extracted from token - Email: {decoded.get('email','')}, Phone: {decoded.get('phone_number','')}, Name: {decoded.get('display_name','')}")
        return decoded.get("email",""), decoded.get("phone_number",""), decoded.get("display_name","")
    except Exception as e:
        print(f"{Fore.RED}Failed to decode auth token: {e}")
        return None, None, None


def fetch_trip_details():
    global trip_id, trip_route_id, boarding_point_id, train_name
    print(f"{Fore.YELLOW}Fetching trip details for {from_city} to {to_city} on {date_of_journey}...")

    while True:
        r = api_request("GET", "/v1.0/web/bookings/search-trips-v2", {"from_city": from_city, "to_city": to_city, "date_of_journey": date_of_journey, "seat_class": seat_class})

        if r and r.get('s') == 200:
            try:
                data = json.loads(r['b']).get("data", {}).get("trains", [])
            except:
                data = []
            if not data:
                print(f"{Fore.YELLOW}Trip details not available yet. Retrying in 1 second...")
                time.sleep(1)
                continue
            for train in data:
                if train.get("train_model") == str(train_number):
                    for seat in train.get("seat_types", []):
                        if seat.get("type") == seat_class:
                            trip_id = seat.get("trip_id")
                            trip_route_id = seat.get("trip_route_id")
                            boarding_point_id = train.get("boarding_points", [{}])[0].get("trip_point_id", None)
                            train_name = train.get("trip_number")
                            print(f"{Fore.GREEN}Trip details found! Train: {train_name}, Trip ID: {trip_id}, Route ID: {trip_route_id}, Boarding Point ID: {boarding_point_id}")
                            return trip_id, trip_route_id, boarding_point_id, train_name
            print(f"{Fore.YELLOW}Train {train_number} / {seat_class} not available yet. Retrying in 1 second...")
            time.sleep(1)
        elif r and r.get('s') in [500, 502, 503, 504]:
            print(f"{Fore.YELLOW}Server overloaded ({r['s']}). Retrying in 1 second...")
            time.sleep(1)
        else:
            status = r.get('s') if r else 'No response'
            body = r.get('b', '')[:200] if r else ''
            print(f"{Fore.RED}Failed to fetch trip details. Status: {status}")
            if body: print(f"{Fore.CYAN}Server response: {body}")
            time.sleep(1)


def is_booking_available():
    consecutive_failures = 0
    MAX_TRANSIENT_RETRIES = 30  # Give up after 30 consecutive transient 422s

    while True:
        r = api_request("GET", "/v1.0/web/bookings/seat-layout", {"trip_id": trip_id, "trip_route_id": trip_route_id})
        if not r:
            print(f"{Fore.YELLOW}No response from API. Retrying in 2s...")
            time.sleep(2)
            continue

        if r['s'] == 200:
            try:
                data = json.loads(r['b'])
                if "seatLayout" in data.get("data", {}):
                    print(f"{Fore.GREEN}Booking is now available!")
                    consecutive_failures = 0
                    return data["data"]["seatLayout"]
            except:
                pass
            # 200 but no seatLayout — may be loading
            print(f"{Fore.YELLOW}Got 200 but no seatLayout in response. Retrying in 2s...")
            time.sleep(2)
            continue

        elif r['s'] == 422:
            try:
                error_data = json.loads(r['b'])
                error_messages = error_data.get("error", {}).get("messages", "")
                error_message = error_messages.get("message", "") if isinstance(error_messages, dict) else (error_messages[0] if isinstance(error_messages, list) and error_messages else str(error_messages))
                error_key = error_messages.get("errorKey", "") if isinstance(error_messages, dict) else ""

                # --- FATAL: Order limit exceeded (won't fix itself) ---
                if error_key == "OrderLimitExceeded":
                    print(f"{Fore.RED}FATAL: You have reached the maximum ticket booking limit.")
                    exit()

                # --- RETRYABLE: Turnstile token issues (single-use, needs regeneration) ---
                if error_key in ("TURNSTILE_TOKEN_REQUIRED", "TURNSTILE_VERIFICATION_FAILED"):
                    print(f"{Fore.YELLOW}Turnstile token expired/invalid. Waiting for new token...")
                    invalidate_turnstile()
                    # Wait for Turnstile widget to regenerate a fresh token
                    time.sleep(3)
                    # Don't count this as a failure — it's expected with single-use tokens
                    continue

                # --- RETRYABLE: Booking window not open yet ---
                if "ticket purchase for this trip will be available" in error_message:
                    print(f"{Fore.YELLOW}Booking not open yet: {error_message}. Retrying in 2s...")
                    time.sleep(2)
                    consecutive_failures = 0
                    continue

                # --- RETRYABLE with wait: Server gives a cooldown time ---
                time_match = re.search(r"(\d+)\s*minute[s]?\s*(\d+)\s*second[s]?", error_message, re.IGNORECASE)
                if time_match:
                    total_wait = int(time_match.group(1)) * 60 + int(time_match.group(2))
                    future = time.strftime("%I:%M:%S %p", time.localtime(time.time() + total_wait))
                    print(f"{Fore.YELLOW}Rate limited: {error_message}. Waiting {total_wait}s until {future}...")
                    # Wait the specified time, then retry (don't exit!)
                    time.sleep(min(total_wait + 1, 600))  # Cap at 10 min
                    invalidate_turnstile()  # Refresh turnstile after waiting
                    consecutive_failures = 0
                    continue

                # --- RETRYABLE: Any other 422 (transient error) ---
                consecutive_failures += 1
                backoff = min(2 * consecutive_failures, 30)  # 2s, 4s, 6s, ... up to 30s
                print(f"{Fore.YELLOW}422 error (attempt {consecutive_failures}/{MAX_TRANSIENT_RETRIES}): {error_message}")
                print(f"{Fore.CYAN}Full 422 body: {r['b'][:500]}")

                if consecutive_failures >= MAX_TRANSIENT_RETRIES:
                    print(f"{Fore.YELLOW}Hit {MAX_TRANSIENT_RETRIES} consecutive 422 errors. Resetting and continuing...")
                    consecutive_failures = 0
                    invalidate_turnstile()
                    time.sleep(10)

                # Refresh turnstile token — stale token is a common cause
                invalidate_turnstile()
                print(f"{Fore.YELLOW}Refreshing turnstile token and retrying in {backoff}s...")
                time.sleep(backoff)
                continue

            except json.JSONDecodeError:
                consecutive_failures += 1
                print(f"{Fore.RED}422 response not valid JSON: {r['b'][:300]}")
                invalidate_turnstile()
                time.sleep(5)
                continue

            except Exception as e:
                consecutive_failures += 1
                print(f"{Fore.RED}Error parsing 422 response: {e}")
                print(f"{Fore.CYAN}Raw body: {r['b'][:300]}")
                invalidate_turnstile()
                time.sleep(5)
                continue

        elif r['s'] in [500, 502, 503, 504]:
            print(f"{Fore.YELLOW}Server error ({r['s']}). Retrying in 3s...")
            time.sleep(3)

        elif r['s'] == 403:
            print(f"{Fore.RED}403 Forbidden — likely Cloudflare/Turnstile block. Refreshing tokens...")
            print(f"{Fore.CYAN}Body: {r['b'][:300]}")
            invalidate_turnstile()
            time.sleep(5)

        else:
            print(f"{Fore.RED}Unexpected HTTP {r['s']}. Retrying in 3s...")
            print(f"{Fore.CYAN}Body: {r['b'][:300]}")
            time.sleep(3)


def get_ticket_ids_from_layout(seat_layout, desired_seats, max_selectable_seat):
    selected_seat_details = {}
    if desired_seats:
        for coach in seat_layout:
            for row in coach["layout"]:
                for seat in row:
                    if seat["seat_availability"] == 1 and seat["seat_number"] in desired_seats:
                        selected_seat_details[seat["ticket_id"]] = seat["seat_number"]
                        if len(selected_seat_details) == max_selectable_seat:
                            return selected_seat_details
        for coach in seat_layout:
            for row in coach["layout"]:
                seat_numbers = [seat for seat in row if seat["seat_availability"] == 1]
                for desired_seat in desired_seats:
                    nearby_seats = [s for s in seat_numbers if s["seat_number"] == desired_seat]
                    if nearby_seats:
                        desired_index = seat_numbers.index(nearby_seats[0])
                        for offset in range(1, len(seat_numbers)):
                            if desired_index + offset < len(seat_numbers):
                                seat = seat_numbers[desired_index + offset]
                                if seat['seat_availability'] == 1 and seat['seat_number'] not in selected_seat_details.values():
                                    selected_seat_details[seat['ticket_id']] = seat['seat_number']
                                    if len(selected_seat_details) == max_selectable_seat: return selected_seat_details
                            if desired_index - offset >= 0:
                                seat = seat_numbers[desired_index - offset]
                                if seat['seat_availability'] == 1 and seat['seat_number'] not in selected_seat_details.values():
                                    selected_seat_details[seat['ticket_id']] = seat['seat_number']
                                    if len(selected_seat_details) == max_selectable_seat: return selected_seat_details
        for coach in seat_layout:
            for row in coach["layout"]:
                for seat in row:
                    if seat["seat_availability"] == 1 and seat["seat_number"] not in selected_seat_details.values():
                        selected_seat_details[seat["ticket_id"]] = seat["seat_number"]
                        if len(selected_seat_details) == max_selectable_seat: return selected_seat_details

    all_available_seats = []
    for coach in seat_layout:
        coach_data = {"coach": coach.get("coach_name", "Unknown"), "seats": []}
        for row in coach["layout"]:
            for seat in row:
                if seat["seat_availability"] == 1:
                    coach_data["seats"].append(seat)
        if coach_data["seats"]:
            all_available_seats.append(coach_data)

    if all_available_seats:
        seats = all_available_seats[0]["seats"]
        if 0 < len(seats):
            selected_seat_details[seats[0]["ticket_id"]] = seats[0]["seat_number"]
            if len(selected_seat_details) == max_selectable_seat: return selected_seat_details

    if len(selected_seat_details) < max_selectable_seat:
        for coach_data in all_available_seats:
            for seat in coach_data["seats"]:
                if len(selected_seat_details) >= max_selectable_seat: break
                if seat["ticket_id"] not in selected_seat_details:
                    selected_seat_details[seat["ticket_id"]] = seat["seat_number"]

    if selected_seat_details:
        if len(selected_seat_details) < max_selectable_seat:
            print(f"{Fore.YELLOW}Warning: Proceeding with {len(selected_seat_details)} seats instead of {max_selectable_seat}")
        return selected_seat_details
    print(f"{Fore.RED}No seats available to proceed.")
    return None


def reserve_seat():
    global trip_id, trip_route_id, boarding_point_id, train_name
    print(f"{Fore.YELLOW}Waiting for seat layout availability...")

    while True:
        seat_layout = is_booking_available()
        if not seat_layout:
            print(f"{Fore.RED}Seat layout could not be retrieved. Retrying in 2s...")
            time.sleep(2)
            continue

        # Log total available seats for diagnostics
        total_available = 0
        for coach in seat_layout:
            for row in coach.get("layout", []):
                for seat in row:
                    if seat.get("seat_availability") == 1:
                        total_available += 1
        print(f"{Fore.CYAN}Total available seats in layout: {total_available}")

        ticket_id_map = get_ticket_ids_from_layout(seat_layout, desired_seats, max_selectable_seat)
        if not ticket_id_map:
            print(f"{Fore.RED}No matching seats found. Retrying in 2s...")
            time.sleep(2)
            continue

        ticket_ids = list(ticket_id_map.keys())
        print(f"{Fore.GREEN}Seats matched! {', '.join([f'{ticket_id_map[t]} (ID: {t})' for t in ticket_ids])}")

        successful = []
        for ticket in ticket_ids:
            if len(successful) >= max_selectable_seat: break
            print(f"{Fore.CYAN}Reserving Seat {ticket_id_map[ticket]} (ID: {ticket})...")
            r = api_request("PATCH", "/v1.0/web/bookings/reserve-seat", json_data={"ticket_id": ticket, "route_id": trip_route_id})
            if r and r['s'] == 200:
                try:
                    if json.loads(r['b'])["data"].get("ack") == 1:
                        print(f"{Fore.GREEN}Seat {ticket_id_map[ticket]} reserved!")
                        successful.append(ticket)
                        continue
                except:
                    pass
                print(f"{Fore.RED}Failed to reserve seat {ticket_id_map[ticket]}: {r['b'][:200]}")
            elif r and r['s'] == 422:
                body = r.get('b', '')[:300]
                print(f"{Fore.RED}Seat {ticket_id_map[ticket]} not available (422): {body}")
            else:
                status = r['s'] if r else 'No response'
                print(f"{Fore.RED}Error: {status} - {r.get('b','')[:200] if r else ''}")

        if successful:
            print(f"{Fore.GREEN}Successfully reserved {len(successful)} seats: {', '.join([ticket_id_map[t] for t in successful])}")
            return successful, ticket_id_map
        else:
            print(f"{Fore.RED}No seats could be reserved. Re-fetching seat layout in 2s...")
            invalidate_turnstile()  # Refresh in case turnstile expired during attempts
            time.sleep(2)


def ensure_on_search_page():
    """Navigate Chrome to the search page so the Turnstile widget loads.
    The turnstile input only exists on certain pages (search, booking), not the homepage."""
    ws_url = get_ws_url()
    if not ws_url:
        return

    current = exec_js(ws_url, "location.href")
    if current and '/booking/train/search' in current:
        print(f"{Fore.GREEN}Browser already on search page.")
        return

    search_url = f"https://eticket.railway.gov.bd/booking/train/search?fromcity={from_city}&tocity={to_city}&doj={date_of_journey}&class={seat_class}"
    print(f"{Fore.YELLOW}Navigating browser to search page (needed for Turnstile token)...")
    exec_js(ws_url, f"location.href = '{search_url}'")

    # Wait for page load and turnstile widget to initialize
    for i in range(20):
        time.sleep(1)
        try:
            ws_url = get_ws_url(force=True)
            if not ws_url:
                continue
            token = exec_js(ws_url, '''(() => {
                const inp = document.querySelector('input[name="cf-turnstile-response"]');
                return inp ? inp.value : null;
            })()''')
            if token:
                print(f"{Fore.GREEN}Turnstile token ready!")
                invalidate_turnstile()  # Force cache refresh with the new token
                return
        except:
            pass

    print(f"{Fore.YELLOW}Turnstile widget may not have loaded. Continuing anyway...")


def launch_chrome():
    """Launch Chrome with remote debugging, killing any existing debug session first.
    Clears user-data-dir for a clean session (forces fresh login)."""
    CHROME_DEBUG_PORT = 9222
    CHROME_USER_DATA = "/tmp/chrome-debug"

    # Check if port 9222 is already listening
    def port_is_open():
        try:
            req = urllib.request.Request(f'http://localhost:{CHROME_DEBUG_PORT}/json/version')
            with urllib.request.urlopen(req, timeout=3) as r:
                return True
        except:
            return False

    if port_is_open():
        print(f"{Fore.YELLOW}Chrome debug port {CHROME_DEBUG_PORT} already open. Killing existing session...")
        # Find and kill the Chrome process using this debug port
        try:
            result = subprocess.run(
                ['lsof', '-ti', f':{CHROME_DEBUG_PORT}'],
                capture_output=True, text=True, timeout=5
            )
            for pid in result.stdout.strip().split('\n'):
                if pid:
                    try:
                        os.kill(int(pid), signal.SIGTERM)
                    except (ProcessLookupError, ValueError):
                        pass
            time.sleep(2)
        except Exception as e:
            print(f"{Fore.YELLOW}Could not kill existing Chrome: {e}")
            # Fallback: pkill
            subprocess.run(['pkill', '-f', f'remote-debugging-port={CHROME_DEBUG_PORT}'],
                           capture_output=True, timeout=5)
            time.sleep(2)

    # Clean user data for fresh session
    if os.path.exists(CHROME_USER_DATA):
        print(f"{Fore.YELLOW}Clearing Chrome user data for clean session...")
        shutil.rmtree(CHROME_USER_DATA, ignore_errors=True)

    # Launch Chrome
    print(f"{Fore.CYAN}Launching Chrome with remote debugging on port {CHROME_DEBUG_PORT}...")
    chrome_cmd = [
        'google-chrome',
        f'--remote-debugging-port={CHROME_DEBUG_PORT}',
        f'--user-data-dir={CHROME_USER_DATA}',
        '--remote-allow-origins=*',
        '--no-first-run',
        '--no-default-browser-check',
        'https://eticket.railway.gov.bd/'
    ]
    subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Wait for Chrome to be ready
    print(f"{Fore.YELLOW}Waiting for Chrome to start...")
    for i in range(30):
        time.sleep(1)
        if port_is_open():
            print(f"{Fore.GREEN}Chrome is ready on port {CHROME_DEBUG_PORT}!")
            # Invalidate any stale cached WS URL
            global _cached_ws_url, _cached_ws_url_time
            _cached_ws_url = None
            _cached_ws_url_time = 0
            return True
    print(f"{Fore.RED}Chrome failed to start within 30s.")
    return False


def fresh_login():
    """Open homepage first, wait for it to load, click Login link,
    then fill credentials and submit. This ensures Cloudflare loads properly."""
    print(f"{Fore.CYAN}Starting fresh login...")

    # Step 1: Wait for homepage to fully load
    print(f"{Fore.YELLOW}Waiting for homepage to load...")
    time.sleep(5)  # Give the Angular app time to bootstrap

    ws_url = get_ws_url(force=True)
    if not ws_url:
        print(f"{Fore.RED}Cannot connect to Chrome for login.")
        return False

    current = exec_js(ws_url, "location.href")
    print(f"{Fore.CYAN}Current page: {current}")

    # Step 2: If on homepage, find and click the Login link/button
    if current and '/login' not in current:
        print(f"{Fore.YELLOW}Looking for Login link on homepage...")
        clicked = exec_js(ws_url, '''(() => {
            // Try common login link selectors
            const selectors = [
                'a[href*="/login"]',
                'a[routerlink*="/login"]',
                'button.login-btn',
                'a.login-btn'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    el.click();
                    return 'clicked: ' + sel;
                }
            }
            // Fallback: find any link/button containing "Login" text
            const allLinks = document.querySelectorAll('a, button');
            for (const el of allLinks) {
                const text = el.textContent.trim().toLowerCase();
                if (text === 'login' || text === 'log in' || text === 'sign in') {
                    el.click();
                    return 'clicked text: ' + el.textContent.trim();
                }
            }
            return null;
        })()''')

        if clicked:
            print(f"{Fore.GREEN}Clicked login link ({clicked}). Waiting for login page...")
        else:
            # If no login link found, navigate directly
            print(f"{Fore.YELLOW}No login link found, navigating directly...")
            exec_js(ws_url, "location.href = 'https://eticket.railway.gov.bd/login'")

        time.sleep(5)  # Wait for navigation and page load
        ws_url = get_ws_url(force=True)
        if not ws_url:
            return False

    # Step 3: Wait for login page to fully render (Angular app)
    print(f"{Fore.YELLOW}Waiting for login form to render...")
    for i in range(15):
        has_form = exec_js(ws_url, '''(() => {
            const inputs = document.querySelectorAll('input');
            return inputs.length >= 2;
        })()''')
        if has_form:
            print(f"{Fore.GREEN}Login form loaded!")
            break
        time.sleep(1)
    else:
        print(f"{Fore.RED}Login form did not load in 15s.")
        return False

    # Step 4: Fill credentials and submit (auto_login waits for Cloudflare)
    auto_login_if_needed(ws_url)

    # Step 5: Verify login succeeded — wait for token in localStorage
    for i in range(30):
        time.sleep(1)
        try:
            ws_url = get_ws_url(force=True)
            if not ws_url:
                continue
            token = exec_js(ws_url, "localStorage.getItem('token')")
            if token:
                print(f"{Fore.GREEN}Login successful! Auth token obtained.")
                return True
        except:
            pass

    print(f"{Fore.RED}Login did not complete within 30s.")
    return False


def main():
    global trip_id, trip_route_id, boarding_point_id, train_name
    try:
        print(f"{Fore.CYAN}Starting ticket booking process...")

        # --- Step 0: Launch Chrome and perform fresh login ---
        if not launch_chrome():
            print(f"{Fore.RED}Failed to launch Chrome. Exiting.")
            exit()

        if not fresh_login():
            print(f"{Fore.RED}Failed to log in automatically. Exiting.")
            exit()

        auth_key = fetch_auth_key()
        if not auth_key:
            print(f"{Fore.RED}Failed to fetch auth token after login. Exiting.")
            exit()

        print(f"{Fore.GREEN}Auth token obtained successfully!")

        _, _, user_name = extract_user_info_from_token(auth_key)

        # Navigate to search page so Turnstile token is available
        ensure_on_search_page()

        fetch_trip_details()

        reserved_ticket_ids, ticket_id_map = reserve_seat()

        otp_payload = {"trip_id": trip_id, "trip_route_id": trip_route_id, "ticket_ids": reserved_ticket_ids}

        r = api_request("POST", "/v1.0/web/bookings/passenger-details", json_data=otp_payload)
        if r and r['s'] == 200:
            try:
                if json.loads(r['b'])["data"]["success"]:
                    print(f"{Fore.GREEN}OTP sent successfully!")
                else:
                    print(f"{Fore.RED}Failed to send OTP: {r['b'][:200]}")
                    return
            except:
                print(f"{Fore.RED}Failed to parse OTP response: {r['b'][:200]}")
                return
        else:
            print(f"{Fore.RED}Failed to send passenger details. Status: {r['s'] if r else 'No response'}")
            return

        otp = input(f"{Fore.YELLOW}Enter the OTP received: ")

        verify_payload = {**otp_payload, "otp": otp}
        r = api_request("POST", "/v1.0/web/bookings/verify-otp", json_data=verify_payload)
        if not r or r['s'] != 200:
            print(f"{Fore.RED}Failed to verify OTP.")
            return

        print(f"{Fore.GREEN}OTP verified successfully!")

        confirm_payload = {
            "is_bkash_online": True, "boarding_point_id": boarding_point_id,
            "from_city": from_city, "to_city": to_city, "date_of_journey": date_of_journey,
            "seat_class": seat_class, "passengerType": ["Adult"] * len(reserved_ticket_ids),
            "gender": ["Male"] * len(reserved_ticket_ids), "pname": [user_name] * len(reserved_ticket_ids),
            "pmobile": "01767088288", "pemail": "a.a.mamun595@gmail.com",
            "trip_id": trip_id, "trip_route_id": trip_route_id, "ticket_ids": reserved_ticket_ids,
            "contactperson": 0, "otp": otp, "selected_mobile_transaction": 1
        }

        print(f"{Fore.CYAN}Select Payment Method:\n1. Bkash\n2. Nagad\n3. Rocket\n4. Upay\n5. VISA\n6. Mastercard\n7. DBBL Nexus")
        choice = input(f"{Fore.YELLOW}Enter choice (1-7): ")
        pm = {"2": (False, 3), "3": (False, 4), "4": (False, 5), "5": (False, "visa"), "6": (False, "mastercard"), "7": (False, "nexus")}
        if choice in pm:
            confirm_payload["is_bkash_online"] = pm[choice][0]
            if isinstance(pm[choice][1], str):
                confirm_payload.pop("selected_mobile_transaction", None)
                confirm_payload["pg"] = pm[choice][1]
            else:
                confirm_payload["selected_mobile_transaction"] = pm[choice][1]

        r = api_request("PATCH", "/v1.0/web/bookings/confirm", json_data=confirm_payload)
        if r and r['s'] == 200:
            try:
                data = json.loads(r['b'])
                if "redirectUrl" in data.get("data", {}):
                    url = data["data"]["redirectUrl"]
                    print(f"\n{Fore.GREEN}{'='*50}")
                    print(f"{Fore.GREEN}Booking confirmed successfully!")
                    print(f"{Fore.YELLOW}IMPORTANT: This payment link can be used ONLY ONCE.")
                    print(f"{Fore.BLUE}Payment URL: {url}")
                    print(f"{Fore.GREEN}{'='*50}\n")
                else:
                    print(f"{Fore.RED}Failed to confirm: {r['b'][:200]}")
            except:
                print(f"{Fore.RED}Failed to parse confirm response: {r['b'][:200]}")
        else:
            print(f"{Fore.RED}Failed to confirm booking. Status: {r['s'] if r else 'No response'}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"{Fore.RED}An unexpected error occurred: {e}")

if __name__ == "__main__":
    main()
