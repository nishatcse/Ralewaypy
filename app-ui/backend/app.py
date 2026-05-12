import requests, time, jwt, os, asyncio, re, json, queue, threading
import urllib.request, urllib.parse
import subprocess, shutil, signal, tempfile, platform
import websocket
import sys
import builtins
from datetime import datetime, timedelta

def wait_for_schedule(schedule_time_str):
    """Wait until the specified time (HH:MM:SS) before proceeding."""
    if not schedule_time_str:
        return
    
    try:
        parts = list(map(int, schedule_time_str.split(':')))
        now = datetime.now()
        # Set target to today
        target = now.replace(hour=parts[0], minute=parts[1], second=parts[2] if len(parts) > 2 else 0, microsecond=0)
        
        # If target is more than 30 mins in the past, assume it's for tomorrow
        if target < (now - timedelta(minutes=30)):
            target += timedelta(days=1)
            print(f"{Fore.CYAN}Target time {schedule_time_str} is in the past. Scheduling for tomorrow.")
        elif target < now:
            print(f"{Fore.YELLOW}Target time {schedule_time_str} is very close or just passed. Starting now.")
            return

        print(f"{Fore.CYAN}--- BOOKING SCHEDULED ---")
        print(f"{Fore.CYAN}Target Time: {target.strftime('%I:%M:%S %p')}")
        print(f"{Fore.CYAN}Current Time: {now.strftime('%I:%M:%S %p')}")
        
        last_print_time = 0
        while datetime.now() < target:
            current_now = datetime.now()
            diff = (target - current_now).total_seconds()
            
            # Print status every 10 seconds if > 1 min remaining, or every 1 sec if < 10s
            should_print = False
            if diff > 60:
                if time.time() - last_print_time >= 30:
                    should_print = True
            elif diff > 10:
                if time.time() - last_print_time >= 5:
                    should_print = True
            else:
                should_print = True
                
            if should_print:
                hours, rem = divmod(int(diff), 3600)
                minutes, seconds = divmod(rem, 60)
                time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}" if hours > 0 else f"{minutes:02d}:{seconds:02d}"
                print(f"{Fore.YELLOW}Waiting for schedule... {time_str} remaining")
                last_print_time = time.time()
            
            # Sleep in small increments to stay responsive to SIGINT
            time.sleep(0.5)
            
        print(f"{Fore.GREEN}Schedule reached! Starting booking process now...")
    except Exception as e:
        print(f"{Fore.RED}Error in schedule logic: {e}. Starting immediately.")

# --- IPC Wrappers for Electron ---
def custom_print(*args, **kwargs):
    msg = " ".join(str(a) for a in args)
    # Strip ansi codes just in case
    msg = re.sub(r'\x1b\[[0-9;]*m', '', msg)
    builtins.print(json.dumps({"type": "log", "message": msg}), flush=True)

def custom_input(prompt_text):
    builtins.print(json.dumps({"type": "prompt", "message": prompt_text}), flush=True)
    return sys.stdin.readline().strip()

def timed_stdin_readline(timeout_seconds, progress_interval=15):
    """Read one stdin line with a timeout that works with Electron pipes."""
    result_queue = queue.Queue(maxsize=1)

    def read_line():
        try:
            result_queue.put(sys.stdin.readline().strip())
        except Exception:
            result_queue.put(None)

    reader = threading.Thread(target=read_line, daemon=True)
    reader.start()

    deadline = time.time() + timeout_seconds
    next_progress = time.time() + progress_interval

    while time.time() < deadline:
        remaining = max(0, int(deadline - time.time()))
        try:
            return result_queue.get(timeout=0.5)
        except queue.Empty:
            if remaining > 0 and time.time() >= next_progress:
                print(f"{Fore.CYAN}Timer: {remaining}s remaining... Waiting for OTP.")
                next_progress += progress_interval

    return None

print = custom_print
input = custom_input

class DummyFore:
    RED = ""
    GREEN = ""
    YELLOW = ""
    CYAN = ""
    def __getattr__(self, name):
        return ""
Fore = DummyFore()
# ---------------------------------

print("Waiting for configuration JSON on stdin...")

# Global state for cleanup
_reserved_tickets_for_cleanup = []

def normalize_desired_seats(raw_value):
    """Return trimmed, non-empty seat names from a comma-separated value."""
    if not raw_value:
        return []
    return [seat.strip() for seat in str(raw_value).split(',') if seat.strip()]

def release_reserved_tickets(reason=""):
    """Release any reserved seats that have not been confirmed yet."""
    global _reserved_tickets_for_cleanup
    if not _reserved_tickets_for_cleanup:
        return

    reason_text = f" {reason}" if reason else ""
    tickets_to_release = list(_reserved_tickets_for_cleanup)
    print(f"{Fore.YELLOW}Releasing {len(tickets_to_release)} reserved seats.{reason_text}")

    for ticket_id in tickets_to_release:
        try:
            api_request("PATCH", "/v1.0/web/bookings/release-seat", json_data={"ticket_id": ticket_id, "route_id": trip_route_id})
        except Exception as e:
            print(f"{Fore.YELLOW}Could not release seat {ticket_id}: {e}")

    _reserved_tickets_for_cleanup = []
    print(f"{Fore.GREEN}Reserved seat cleanup completed.")

def cleanup_on_exit(sig=None, frame=None):
    """Gracefully release seats and invalidate turnstile on exit/stop."""
    release_reserved_tickets("Stop requested.")
    
    try:
        invalidate_turnstile()
    except:
        pass
        
    if sig is not None:
        print(f"{Fore.RED}Process stopped by user signal.")
        sys.exit(0)

# Register signal handlers for graceful stop
signal.signal(signal.SIGINT, cleanup_on_exit)
signal.signal(signal.SIGTERM, cleanup_on_exit)

try:
    config_str = sys.stdin.readline()
    config = json.loads(config_str)
except Exception as e:
    print(f"Error reading config: {e}")
    sys.exit(1)

from_city = config.get("FROM_CITY")
to_city = config.get("TO_CITY")
date_of_journey = config.get("DATE_OF_JOURNEY")
try:
    # Try to parse YYYY-MM-DD from the new frontend picker
    date_obj = datetime.strptime(date_of_journey, '%Y-%m-%d')
    date_of_journey = date_obj.strftime('%d-%b-%Y')
except (ValueError, TypeError):
    pass
seat_class = config.get("SEAT_CLASS")
train_number = int(config.get("TRAIN_NUMBER", 0))
max_selectable_seat = int(config.get("MAX_SELECTABLE_SEAT", 1))
desired_seats_raw = config.get("DESIRED_SEATS", "")
desired_seats = normalize_desired_seats(desired_seats_raw)
flexible_seat_count = bool(config.get("FLEXIBLE_SEAT_COUNT", False))
mobile_number = config.get("MOBILE_NUMBER")
password = config.get("PASSWORD")
LOGIN_ONLY = config.get("LOGIN_ONLY", False)

if not LOGIN_ONLY:
    print(f"{Fore.CYAN}Starting ticket booking process...")
else:
    print(f"{Fore.CYAN}Starting Pre-Login Session...")

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
TURNSTILE_TTL = 240     # Re-read turnstile token every 4 min (they expire after 300s officially)
WATCHER_JS = '''
if (!window.cftWatcherInjected) {
    window.cftWatcherInjected = true;
    setInterval(() => {
        const inp = document.querySelector('input[name="cf-turnstile-response"]');
        if (inp && inp.value && inp.value !== localStorage.getItem('last_seen_cft')) {
            localStorage.setItem('last_seen_cft', inp.value);
            localStorage.setItem('last_cft_time', Date.now().toString());
        }
    }, 1000);
}
'''


def get_ws_url(force=False):
    global _cached_ws_url, _cached_ws_url_time
    now = time.time()
    if not force and _cached_ws_url and (now - _cached_ws_url_time) < WS_URL_TTL:
        return _cached_ws_url

    for attempt in range(5):
        try:
            req = urllib.request.Request('http://localhost:9222/json')
            with urllib.request.urlopen(req, timeout=2) as response:
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
        time.sleep(0.3)
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
                time.sleep(0.5)
            else:
                raise


def wait_for_js_value(ws_url, js, timeout=10, interval=0.5, refresh_ws=False):
    """Poll a browser expression until it returns a truthy value."""
    deadline = time.time() + timeout
    current_ws = ws_url
    while time.time() < deadline:
        try:
            if refresh_ws:
                current_ws = get_ws_url(force=True) or current_ws
            value = exec_js(current_ws, js)
            if value:
                return current_ws, value
        except:
            pass
        time.sleep(interval)
    return current_ws, None


def get_turnstile_token(ws_url, force=False):
    """Read the current Turnstile token, with an option to force a reset if stale."""
    global _cached_turnstile, _cached_turnstile_time

    # 1. If we have a cached token that is fresh, use it
    if not force and _cached_turnstile and (time.time() - _cached_turnstile_time) < TURNSTILE_TTL:
        token = _cached_turnstile
        _cached_turnstile = None
        return token

    # 2. If forced or we suspect stale token, trigger a reset on the page
    if force:
        print(f"{Fore.YELLOW}Forcing Turnstile reset on page...")
        exec_js(ws_url, """
            try {
                if (window.turnstile) {
                    turnstile.reset();
                    localStorage.removeItem('last_seen_cft');
                    localStorage.removeItem('last_cft_time');
                } else {
                    // Fallback: clear the input to maybe trigger re-solve
                    const inp = document.querySelector('input[name="cf-turnstile-response"]');
                    if (inp) inp.value = '';
                }
            } catch(e) {}
        """)
        # Clear cache immediately
        _cached_turnstile = None
        _cached_turnstile_time = 0
        time.sleep(1) # Brief pause for widget to react

    # 3. Inject watcher to ensure we capture the new token
    exec_js(ws_url, WATCHER_JS)

    # Try to get current token and its age from the page
    js = '''(() => {
        const inp = document.querySelector('input[name="cf-turnstile-response"]');
        const token = inp ? inp.value : null;
        const lastTime = localStorage.getItem('last_cft_time');
        const now = Date.now();
        const age = lastTime ? (now - parseInt(lastTime)) / 1000 : 999;

        return JSON.stringify({token: token, age: age});
    })()'''

    result_str = exec_js(ws_url, js)

    try:
        result = json.loads(result_str)
        token = result.get('token')
        age = result.get('age', 999)
        
        if token and age < TURNSTILE_TTL:
            return token
    except:
        pass

    # Token not available yet; poll briefly instead of resetting the widget.
    _, token = wait_for_js_value(ws_url, '''(() => {
        const inp = document.querySelector('input[name="cf-turnstile-response"]');
        return inp && inp.value ? inp.value : null;
    })()''', timeout=8, interval=0.5)
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


def invalidate_turnstile(ws_url=None):
    """Force turnstile token refresh on next API call, and optionally reset the page widget."""
    global _cached_turnstile, _cached_turnstile_time
    _cached_turnstile = None
    _cached_turnstile_time = 0
    if ws_url:
        get_turnstile_token(ws_url, force=True)


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
    
    # Add Turnstile to params for GET, and both Body/Headers for others
    if cft:
        params['cft_response'] = cft

    url = f"{API_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    # Escape single quotes in token values for JS string safety
    token_escaped = headers['token'].replace("'", "\\'")
    uudid_escaped = headers['uudid'].replace("'", "\\'")
    ssdk_escaped = headers['ssdk'].replace("'", "\\'")
    cft_escaped = cft.replace("'", "\\'") if cft else ""

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
        if ('{cft_escaped}') {{
            opts.headers['X-Turnstile-Token'] = '{cft_escaped}';
        }}
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
        # If it's a mutation, also include Turnstile in the body if available
        if cft:
            json_data['cft_response'] = cft
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

        // Wait briefly for Turnstile to finish if it is already close to ready.
        let turnstileReady = false;
        for (let i = 0; i < 10; i++) {{
            await new Promise(r => setTimeout(r, 500));
            const cft = document.querySelector('input[name="cf-turnstile-response"]');
            if (cft && cft.value && cft.value.length > 10) {{
                turnstileReady = true;
                break;
            }}
        }}

        if (!turnstileReady) {{
            return JSON.stringify({{ok: false, msg: 'Turnstile token was not ready'}});
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

    # Wait for login to complete — the site may open a new tab or redirect.
    deadline = time.time() + 20
    while time.time() < deadline:
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
                    wait_for_js_value(new_ws, "document.readyState === 'complete'", timeout=5, interval=0.5, refresh_ws=True)
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

        time.sleep(0.5)

    print(f"{Fore.RED}Login timed out after 20s. Please log in manually.")


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

    # Format date for the search-trips API
    formatted_date = date_of_journey

    start_time = time.time()
    retry_delay = 1
    while True:
        r = api_request("GET", "/v1.0/web/bookings/search-trips-v2", {"from_city": from_city, "to_city": to_city, "date_of_journey": formatted_date, "seat_class": seat_class})

        if r and r.get('s') == 200:
            try:
                data = json.loads(r['b']).get("data", {}).get("trains", [])
            except:
                data = []
            if not data:
                print(f"{Fore.YELLOW}Trip details not available yet. Retrying in 1 second(s)...")
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
                            elapsed = time.time() - start_time
                            print(f"{Fore.GREEN}Trip details found! Train: {train_name} (Time taken: {elapsed:.2f}s)")
                            return trip_id, trip_route_id, boarding_point_id, train_name
            print(f"{Fore.YELLOW}Train {train_number} / {seat_class} not available yet. Retrying in 1 second(s)...")
            time.sleep(1)
            retry_delay = 1  # Reset backoff on 200 OK
        elif r and r.get('s') in [500, 502, 503, 504]:
            print(f"{Fore.YELLOW}Server overloaded ({r['s']}). Retrying in {retry_delay} second(s)...")
            time.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 10)
        else:
            status = r.get('s') if r else 'No response'
            body = r.get('b', '')[:200] if r else ''
            print(f"{Fore.RED}Failed to fetch trip details. Status: {status}")
            if body: print(f"{Fore.CYAN}Server response: {body}")
            time.sleep(1)


def is_booking_available(overall_start_time=None):
    consecutive_failures = 0
    MAX_TRANSIENT_RETRIES = 30  # Give up after 30 consecutive transient 422s
    poll_start_time = time.time()

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
                    poll_elapsed = time.time() - poll_start_time
                    if overall_start_time:
                        total_elapsed = time.time() - overall_start_time
                        print(f"{Fore.GREEN}Booking is now available! (Polling time: {poll_elapsed:.2f}s, Total Discovery Time: {total_elapsed:.2f}s)")
                    else:
                        print(f"{Fore.GREEN}Booking is now available! (Polling time: {poll_elapsed:.2f}s)")
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
                    sys.exit(1)

                # --- RETRYABLE: Page verification issues ---
                if error_key in ("TURNSTILE_TOKEN_REQUIRED", "TURNSTILE_VERIFICATION_FAILED"):
                    print(f"{Fore.YELLOW}Verification token rejected. Forcing refresh...")
                    invalidate_turnstile(get_ws_url())
                    time.sleep(2)
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
                    consecutive_failures = 0
                    continue

                # --- RETRYABLE: Any other 422 (transient error) ---
                consecutive_failures += 1
                backoff = min(2 * consecutive_failures, 30)  # 2s, 4s, 6s, ... up to 30s
                print(f"{Fore.YELLOW}422 error (attempt {consecutive_failures}/{MAX_TRANSIENT_RETRIES}): {error_message}")
                print(f"{Fore.CYAN}Full 422 body: {r['b'][:500]}")

                if consecutive_failures >= MAX_TRANSIENT_RETRIES:
                    print(f"{Fore.YELLOW}Hit {MAX_TRANSIENT_RETRIES} consecutive 422 errors. Pausing and continuing...")
                    consecutive_failures = 0
                    time.sleep(10)

                print(f"{Fore.YELLOW}Retrying in {backoff}s...")
                time.sleep(backoff)
                continue

            except json.JSONDecodeError:
                consecutive_failures += 1
                print(f"{Fore.RED}422 response not valid JSON: {r['b'][:300]}")
                time.sleep(5)
                continue

            except Exception as e:
                consecutive_failures += 1
                print(f"{Fore.RED}Error parsing 422 response: {e}")
                print(f"{Fore.CYAN}Raw body: {r['b'][:300]}")
                time.sleep(5)
                continue

        elif r['s'] in [500, 502, 503, 504]:
            print(f"{Fore.YELLOW}Server error ({r['s']}). Retrying in 3s...")
            time.sleep(3)

        elif r['s'] == 403:
            print(f"{Fore.RED}403 Forbidden.")
            print(f"{Fore.CYAN}Body: {r['b'][:300]}")
            time.sleep(5)

        elif isinstance(r.get('s'), int) and 400 <= r['s'] < 500:
            print(f"{Fore.RED}Client error HTTP {r['s']}. Retrying in 3s...")
            print(f"{Fore.CYAN}Body: {r['b'][:300]}")
            time.sleep(3)

        else:
            print(f"{Fore.RED}Unexpected HTTP {r['s']}. Retrying in 3s...")
            print(f"{Fore.CYAN}Body: {r['b'][:300]}")
            time.sleep(3)


def get_ticket_ids_from_layout(seat_layout, desired_seats, max_selectable_seat, allow_flexible=False):
    if not seat_layout:
        print(f"{Fore.RED}No seat layout available.")
        return None

    # Map of available seat_number to ticket_id
    available_seats = {}
    for coach in seat_layout:
        for row in coach.get('layout', []):
            for seat in row:
                if seat.get('seat_availability') == 1:
                    available_seats[seat.get('seat_number')] = seat.get('ticket_id')

    if not available_seats:
        print(f"{Fore.RED}No available seats found!")
        return None

    selected_seat_details = {}

    # Try to reserve specifically requested seats first
    if desired_seats:
        for desired_seat in desired_seats:
            if desired_seat in available_seats and len(selected_seat_details) < max_selectable_seat:
                selected_seat_details[available_seats[desired_seat]] = desired_seat

    # Add additional available seats if needed
    if len(selected_seat_details) < max_selectable_seat:
        for seat_number, ticket_id in available_seats.items():
            if ticket_id not in selected_seat_details and len(selected_seat_details) < max_selectable_seat:
                selected_seat_details[ticket_id] = seat_number

    if not selected_seat_details:
        print(f"{Fore.RED}No seats available to proceed.")
        return None

    if len(selected_seat_details) < max_selectable_seat and not allow_flexible:
        print(f"{Fore.YELLOW}Only {len(selected_seat_details)} matching seats found; strict mode requires {max_selectable_seat}.")
        return None

    if len(selected_seat_details) < max_selectable_seat:
        print(f"{Fore.YELLOW}Warning: Proceeding with {len(selected_seat_details)} seats instead of {max_selectable_seat}")
    
    return selected_seat_details


def release_ticket_ids(ticket_ids, reason=""):
    if not ticket_ids:
        return
    reason_text = f" {reason}" if reason else ""
    print(f"{Fore.YELLOW}Releasing {len(ticket_ids)} reserved seats.{reason_text}")
    for ticket_id in ticket_ids:
        try:
            api_request("PATCH", "/v1.0/web/bookings/release-seat", json_data={"ticket_id": ticket_id, "route_id": trip_route_id})
        except Exception as e:
            print(f"{Fore.YELLOW}Could not release seat {ticket_id}: {e}")


def reserve_seat(overall_start_time=None):
    global trip_id, trip_route_id, boarding_point_id, train_name
    print(f"{Fore.YELLOW}Waiting for seat layout availability...")

    while True:
        seat_layout = is_booking_available(overall_start_time)
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

        ticket_id_map = get_ticket_ids_from_layout(seat_layout, desired_seats, max_selectable_seat, flexible_seat_count)
        if not ticket_id_map:
            if total_available == 0:
                # If there are NO seats at all, back off more aggressively to avoid hitting Turnstile limits
                print(f"{Fore.YELLOW}Layout is empty. No seats available. Retrying in 4s...")
                time.sleep(4)
            else:
                # Some seats exist but didn't match our criteria (e.g. strict mode)
                print(f"{Fore.RED}No matching seat group found. Retrying in 2s...")
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

        if successful and (flexible_seat_count or len(successful) == max_selectable_seat):
            print(f"{Fore.GREEN}Successfully reserved {len(successful)} seats: {', '.join([ticket_id_map[t] for t in successful])}")
            return successful, ticket_id_map
        elif successful:
            print(f"{Fore.YELLOW}Strict mode reserved only {len(successful)} of {max_selectable_seat}. Releasing and retrying...")
            release_ticket_ids(successful, "Strict count not met.")
            time.sleep(1)
        else:
            print(f"{Fore.RED}No seats could be reserved. Re-fetching seat layout in 1s...")
            time.sleep(1)


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
    print(f"{Fore.YELLOW}Navigating browser to search page...")
    exec_js(ws_url, f"location.href = '{search_url}'")

    # Wait for page load and token watcher without forcing widget resets.
    deadline = time.time() + 8
    while time.time() < deadline:
        try:
            ws_url = get_ws_url(force=True)
            if not ws_url:
                continue
            exec_js(ws_url, WATCHER_JS)
            
            res_str = exec_js(ws_url, '''(() => {
                const inp = document.querySelector('input[name="cf-turnstile-response"]');
                const lastTime = localStorage.getItem('last_cft_time');
                const age = lastTime ? (Date.now() - parseInt(lastTime)) / 1000 : 999;
                return JSON.stringify({token: inp ? inp.value : null, age: age});
            })()''')
            
            try:
                res = json.loads(res_str)
                token = res.get('token')
                age = res.get('age', 999)
                
                if token and age < TURNSTILE_TTL:
                    print(f"{Fore.GREEN}Page verification token ready (age: {age:.1f}s).")
                    return
            except:
                pass
        except:
            pass
        time.sleep(0.5)

    print(f"{Fore.YELLOW}Page verification token was not ready. Continuing anyway...")


def _find_chrome_binary():
    """Locate the Chrome/Chromium binary across Linux, macOS, and Windows."""
    IS_WIN = platform.system() == 'Windows'
    IS_MAC = platform.system() == 'Darwin'

    if IS_WIN:
        # Common Chrome install paths on Windows
        candidates = [
            os.path.join(os.environ.get('PROGRAMFILES', 'C:\\Program Files'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
            os.path.join(os.environ.get('PROGRAMFILES(X86)', 'C:\\Program Files (x86)'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
            os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ]
    elif IS_MAC:
        candidates = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
    else:  # Linux
        candidates = [
            'google-chrome',
            'google-chrome-stable',
            'chromium-browser',
            'chromium',
        ]

    for c in candidates:
        if os.path.isabs(c):
            if os.path.isfile(c):
                return c
        else:
            # Check if command is on PATH
            try:
                result = subprocess.run(
                    ['which', c] if not IS_WIN else ['where', c],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0 and result.stdout.strip():
                    return c
            except Exception:
                pass
    return None


def _kill_chrome_on_port(port):
    """Kill any Chrome process listening on the given debug port (cross-platform)."""
    IS_WIN = platform.system() == 'Windows'

    if IS_WIN:
        # Windows: use netstat + taskkill
        try:
            result = subprocess.run(
                ['netstat', '-ano'],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.splitlines():
                if f':{port}' in line and 'LISTENING' in line:
                    parts = line.split()
                    pid = parts[-1]
                    if pid.isdigit():
                        subprocess.run(['taskkill', '/PID', pid, '/F'],
                                       capture_output=True, timeout=5)
        except Exception as e:
            print(f"{Fore.YELLOW}Could not kill Chrome on Windows: {e}")
            # Fallback
            subprocess.run(['taskkill', '/IM', 'chrome.exe', '/F'],
                           capture_output=True, timeout=5)
    else:
        # Linux/macOS: use lsof + kill
        try:
            result = subprocess.run(
                ['lsof', '-ti', f':{port}'],
                capture_output=True, text=True, timeout=5
            )
            for pid in result.stdout.strip().split('\n'):
                if pid:
                    try:
                        os.kill(int(pid), signal.SIGTERM)
                    except (ProcessLookupError, ValueError):
                        pass
        except Exception as e:
            print(f"{Fore.YELLOW}Could not kill existing Chrome: {e}")
            # Fallback: pkill
            subprocess.run(['pkill', '-f', f'remote-debugging-port={port}'],
                           capture_output=True, timeout=5)

    deadline = time.time() + 3
    while time.time() < deadline:
        try:
            req = urllib.request.Request(f'http://localhost:{port}/json/version')
            urllib.request.urlopen(req, timeout=0.5)
        except:
            return
        time.sleep(0.2)


def launch_chrome():
    """Launch or reuse Chrome with remote debugging.
    Reusing the browser/profile avoids unnecessary resets and starts faster."""
    CHROME_DEBUG_PORT = 9222
    CHROME_USER_DATA = os.path.join(tempfile.gettempdir(), 'chrome-debug')

    # Check if port 9222 is already listening
    def port_is_open():
        try:
            req = urllib.request.Request(f'http://localhost:{CHROME_DEBUG_PORT}/json/version')
            with urllib.request.urlopen(req, timeout=3) as r:
                return True
        except:
            return False

    if port_is_open():
        # Check if we already have a valid session before killing
        token = fetch_auth_key()
        if token:
            print(f"{Fore.GREEN}Active Chrome session with valid token detected. Reusing existing session.")
            return True
        else:
            print(f"{Fore.YELLOW}Chrome debug port {CHROME_DEBUG_PORT} already open. Reusing it for login.")
            return True

    # Find Chrome binary
    chrome_bin = _find_chrome_binary()
    if not chrome_bin:
        print(f"{Fore.RED}Chrome not found! Please install Google Chrome.")
        return False

    # Launch Chrome normally so interactive checks can complete without off-screen behavior.
    print(f"{Fore.CYAN}Launching Chrome ({chrome_bin}) with remote debugging on port {CHROME_DEBUG_PORT}...")
    chrome_cmd = [
        chrome_bin,
        f'--remote-debugging-port={CHROME_DEBUG_PORT}',
        f'--user-data-dir={CHROME_USER_DATA}',
        '--remote-allow-origins=*',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1280,900',
        'https://eticket.railway.gov.bd/'
    ]

    # On Windows, use CREATE_NO_WINDOW to suppress the console window
    kwargs = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
    if platform.system() == 'Windows':
        kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
    else:
        # On Linux/macOS, use start_new_session to decouple Chrome from Python
        kwargs['start_new_session'] = True
        
    subprocess.Popen(chrome_cmd, **kwargs)

    # Wait for Chrome to be ready
    print(f"{Fore.YELLOW}Waiting for Chrome to start...")
    for i in range(30):
        if port_is_open():
            print(f"{Fore.GREEN}Chrome is ready on port {CHROME_DEBUG_PORT}!")
            # Invalidate any stale cached WS URL
            global _cached_ws_url, _cached_ws_url_time
            _cached_ws_url = None
            _cached_ws_url_time = 0
            return True
        time.sleep(0.5)
    print(f"{Fore.RED}Chrome failed to start within 15s.")
    return False


def fresh_login():
    """Open homepage first, wait for it to load, click Login link,
    then fill credentials and submit. This ensures Cloudflare loads properly.
    
    Key insight: wait for real page readiness instead of using long fixed sleeps."""
    print(f"{Fore.CYAN}Starting fresh login...")

    # Step 0: Reuse any existing browser state. Avoid clearing storage unless the
    # site itself invalidates the session.
    ws_url = get_ws_url()

    # Step 1: Wait for homepage to fully load (Angular bootstrap + Cloudflare JS)
    print(f"{Fore.YELLOW}Step 1/6: Waiting for homepage to load...")
    ws_url, _ = wait_for_js_value(ws_url, "document.readyState === 'complete' || document.readyState === 'interactive'", timeout=8, interval=0.5, refresh_ws=True)

    # Step 0.5: Force clear any existing session in browser to reflect new credentials
    print(f"{Fore.YELLOW}Ensuring clean session for fresh login...")
    exec_js(ws_url, "localStorage.clear(); sessionStorage.clear();")
    # Try to find and click logout if visible
    exec_js(ws_url, '''(() => {
        const logoutBtn = Array.from(document.querySelectorAll('a, button')).find(el => {
            const t = el.textContent.toLowerCase();
            return t.includes('logout') || t.includes('sign out');
        });
        if (logoutBtn) logoutBtn.click();
    })()''')
    time.sleep(1) # Wait for potential logout redirect

    current = exec_js(ws_url, "location.href")
    print(f"{Fore.CYAN}Current page: {current}")

    # Step 2: Navigate to login page
    if current and '/login' not in current:
        print(f"{Fore.YELLOW}Step 2/6: Navigating to login page...")
        clicked = exec_js(ws_url, '''(() => {
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
            print(f"{Fore.YELLOW}No login link found, navigating directly...")
            exec_js(ws_url, "location.href = 'https://eticket.railway.gov.bd/login'")

        ws_url, _ = wait_for_js_value(
            ws_url,
            "location.href.includes('/login') || document.querySelectorAll('input').length >= 2",
            timeout=8,
            interval=0.5,
            refresh_ws=True
        )
        if not ws_url:
            return False
    else:
        print(f"{Fore.GREEN}Step 2/6: Already on login page.")

    # Step 3: Wait for login form to fully render (Angular app)
    print(f"{Fore.YELLOW}Step 3/6: Waiting for login form to render...")
    ws_url, form_loaded = wait_for_js_value(ws_url, '''(() => {
        const inputs = document.querySelectorAll('input');
        return inputs.length >= 2;
    })()''', timeout=12, interval=0.5, refresh_ws=True)

    if not form_loaded:
        print(f"{Fore.RED}Login form did not load within 12s.")
        return False
    print(f"{Fore.GREEN}Login form detected!")

    # Step 4: Wait briefly for the page's own challenge widget to become ready.
    print(f"{Fore.YELLOW}Step 4/6: Waiting for page verification token...")
    turnstile_solved = False
    for attempt in range(24):  # Up to 12s.
        try:
            token_status = exec_js(ws_url, '''(() => {
                const iframe = document.querySelector('iframe[src*="turnstile"]');
                const inp = document.querySelector('input[name="cf-turnstile-response"]');
                const hasToken = inp && inp.value && inp.value.length > 10;
                return JSON.stringify({
                    iframeFound: !!iframe,
                    inputFound: !!inp,
                    hasToken: hasToken,
                    tokenLen: inp ? (inp.value || '').length : 0
                });
            })()''')
            if token_status:
                status = json.loads(token_status)
                if status.get('hasToken'):
                    print(f"{Fore.GREEN}Verification token ready! (token length: {status['tokenLen']})")
                    turnstile_solved = True
                    break
                else:
                    detail = f"iframe={'✓' if status.get('iframeFound') else '✗'}, input={'✓' if status.get('inputFound') else '✗'}"
                    if attempt % 5 == 0:
                        print(f"{Fore.YELLOW}  Page verification pending... ({detail}) [{attempt+1}/24]")
        except:
            pass
        time.sleep(0.5)

    if not turnstile_solved:
        print(f"{Fore.RED}Verification token was not ready within 12s. Proceeding anyway (may fail)...")

    # Step 5: Fill credentials and submit
    print(f"{Fore.YELLOW}Step 5/6: Filling credentials and submitting...")
    auto_login_if_needed(ws_url)

    # Step 6: Verify login succeeded — wait for token in localStorage
    print(f"{Fore.YELLOW}Step 6/6: Verifying login...")
    deadline = time.time() + 20
    while time.time() < deadline:
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
        time.sleep(0.5)

    print(f"{Fore.RED}Login did not complete within 20s.")
    return False


def main():
    global trip_id, trip_route_id, boarding_point_id, train_name, _reserved_tickets_for_cleanup
    try:
        # --- Step 0: Launch Chrome and verify or perform login ---
        if not launch_chrome():
            print(f"{Fore.RED}Failed to launch Chrome. Exiting.")
            exit()

        # Start the actual booking flow
        print(f"{Fore.CYAN}--- Verifying Login Session ---")
        login_start_time = time.time()
        
        force_refresh = config.get('REFRESH_LOGIN', False)
        if force_refresh:
            global _cached_auth, _cached_auth_time
            _cached_auth = None
            _cached_auth_time = 0
            
        auth_key = None if force_refresh else fetch_auth_key()
        
        if auth_key:
            print(f"{Fore.GREEN}Existing active session detected. Skipping fresh login.")
        else:
            if force_refresh:
                print(f"{Fore.YELLOW}Refresh requested. Starting Fresh Login Flow...")
            else:
                print(f"{Fore.YELLOW}No active session found. Starting Fresh Login Flow...")
                
            if not fresh_login():
                print(f"{Fore.RED}Login failed. Cannot proceed.")
                return
            auth_key = fetch_auth_key()

        if not auth_key:
            print(f"{Fore.RED}Failed to fetch auth token. Exiting.")
            exit()

        print(f"{Fore.GREEN}Auth token obtained successfully!")
        
        user_email, user_phone, user_name = extract_user_info_from_token(auth_key)

        if LOGIN_ONLY:
            elapsed = time.time() - login_start_time
            builtins.print(json.dumps({"type": "auth_success", "user": {"name": user_name, "email": user_email}}), flush=True)
            print(f"{Fore.GREEN}Pre-login successful! (Time taken: {elapsed:.2f}s)")
            print(f"{Fore.GREEN}Session is now active. You can start booking now.")
            exit()

        # Scheduling applies only to booking actions. Login/session refresh happens immediately.
        schedule_time = config.get('SCHEDULE_TIME')
        if schedule_time:
            print(f"{Fore.CYAN}Pre-login is ready. Waiting for scheduled booking time before searching seats.")
            wait_for_schedule(schedule_time)

        # Navigate to search page so Turnstile token is available
        ensure_on_search_page()

        search_start = time.time()
        fetch_trip_details()
        print(f"{Fore.GREEN}Trip search completed! (Time taken: {time.time() - search_start:.2f}s)")

        reserve_start = time.time()
        reserved_ticket_ids, ticket_id_map = reserve_seat(overall_start_time=search_start)
        print(f"{Fore.GREEN}Seat reservation completed! (Time taken: {time.time() - reserve_start:.2f}s)")
        
        _reserved_tickets_for_cleanup = reserved_ticket_ids  # Track for cleanup if stopped

        otp_payload = {"trip_id": trip_id, "trip_route_id": trip_route_id, "ticket_ids": reserved_ticket_ids}

        otp_send_start = time.time()
        r = api_request("POST", "/v1.0/web/bookings/passenger-details", json_data=otp_payload)
        if r and r['s'] == 200:
            try:
                if json.loads(r['b'])["data"]["success"]:
                    print(f"{Fore.GREEN}OTP sent successfully! (Time taken: {time.time() - otp_send_start:.2f}s)")
                else:
                    print(f"{Fore.RED}Failed to send OTP: {r['b'][:200]}")
                    return
            except:
                print(f"{Fore.RED}Failed to parse OTP response: {r['b'][:200]}")
                return
        else:
            print(f"{Fore.RED}Failed to send passenger details. Status: {r['s'] if r else 'No response'}")
            return

        # --- OTP Verification Loop ---
        max_otp_attempts = 3
        otp = ""
        otp_timeout = 120 # 2 minutes
        otp_verified = False
        
        for attempt in range(max_otp_attempts):
            prompt_text = f"Enter the OTP received (Attempt {attempt+1}/{max_otp_attempts})"
            # Signal the UI to accept input
            builtins.print(json.dumps({"type": "prompt", "message": prompt_text}), flush=True)
            
            print(f"{Fore.YELLOW}Timer: 120s remaining. Please enter OTP now...")
            
            otp = timed_stdin_readline(otp_timeout)
            if otp is None:
                print(f"{Fore.RED}Time exceeded (2 minutes reached)! OTP is likely invalid now.")
                builtins.print(json.dumps({"type": "prompt", "message": ""}), flush=True)
                return

            if not otp:
                print(f"{Fore.RED}Blank OTP submitted.")
                if attempt < max_otp_attempts - 1:
                    print(f"{Fore.YELLOW}Please enter the OTP to continue.")
                    continue
                print(f"{Fore.RED}Maximum OTP attempts reached. Process terminated.")
                builtins.print(json.dumps({"type": "prompt", "message": ""}), flush=True)
                return

            verify_payload = {**otp_payload, "otp": otp}
            verify_start = time.time()
            r = api_request("POST", "/v1.0/web/bookings/verify-otp", json_data=verify_payload)
            
            if r and r['s'] == 200:
                print(f"{Fore.GREEN}OTP verified successfully! (Time taken: {time.time() - verify_start:.2f}s)")
                otp_verified = True
                builtins.print(json.dumps({"type": "prompt", "message": ""}), flush=True)
                break
            else:
                status = r['s'] if r else 'No response'
                error_msg = "Unknown error"
                try:
                    error_data = json.loads(r['b'])
                    error_messages = error_data.get("error", {}).get("messages", {})
                    if isinstance(error_messages, dict):
                        error_msg = error_messages.get("message", r['b'][:200])
                    else:
                        error_msg = str(error_messages)
                except:
                    error_msg = r['b'][:200] if r else "Connection timed out"

                print(f"{Fore.RED}Failed to verify OTP: {error_msg}")
                if attempt < max_otp_attempts - 1:
                    print(f"{Fore.YELLOW}Giving you another chance to enter the correct OTP...")
                else:
                    print(f"{Fore.RED}Maximum OTP attempts reached. Process terminated.")
                    builtins.print(json.dumps({"type": "prompt", "message": ""}), flush=True)
                    return
        # -----------------------------

        if not otp_verified:
            print(f"{Fore.RED}OTP was not verified. Process terminated.")
            builtins.print(json.dumps({"type": "prompt", "message": ""}), flush=True)
            return

        # Collect passenger names for multi-seat bookings
        passenger_names = [user_name]
        if len(reserved_ticket_ids) > 1:
            print(f"{Fore.CYAN}Multiple seats reserved. Enter names for additional passengers:")
            for i in range(1, len(reserved_ticket_ids)):
                seat_name = ticket_id_map.get(reserved_ticket_ids[i], f"Seat {i+1}")
                name = input(f"{Fore.YELLOW}Enter passenger {i+1} name ({seat_name}): ").strip()
                if not name:
                    name = user_name  # Default to logged-in user's name
                passenger_names.append(name)

        confirm_payload = {
            "is_bkash_online": True, "boarding_point_id": boarding_point_id,
            "from_city": from_city, "to_city": to_city, "date_of_journey": date_of_journey,
            "seat_class": seat_class, "passengerType": ["Adult"] * len(reserved_ticket_ids),
            "gender": ["Male"] * len(reserved_ticket_ids), "pname": passenger_names,
            "pmobile": user_phone or mobile_number, "pemail": user_email or "",
            "trip_id": trip_id, "trip_route_id": trip_route_id, "ticket_ids": reserved_ticket_ids,
            "contactperson": 0, "otp": otp, "selected_mobile_transaction": 1
        }

        print(f"{Fore.CYAN}Select Payment Method:\n1. Bkash\n2. Nagad\n3. Rocket\n4. Upay\n5. VISA\n6. Mastercard\n7. DBBL Nexus")
        choice = input(f"{Fore.YELLOW}Enter choice (1-7) | 1-Bkash, 2-Nagad, 3-Rocket, 4-Upay, 5-VISA, 6-Mastercard, 7-Nexus: ")
        pm = {"2": (False, 3), "3": (False, 4), "4": (False, 5), "5": (False, "visa"), "6": (False, "mastercard"), "7": (False, "nexus")}
        if choice in pm:
            confirm_payload["is_bkash_online"] = pm[choice][0]
            if isinstance(pm[choice][1], str):
                confirm_payload.pop("selected_mobile_transaction", None)
                confirm_payload["pg"] = pm[choice][1]
            else:
                confirm_payload["selected_mobile_transaction"] = pm[choice][1]

        confirm_start = time.time()
        r = api_request("PATCH", "/v1.0/web/bookings/confirm", json_data=confirm_payload)
        if r and r['s'] == 200:
            try:
                data = json.loads(r['b'])
                if "redirectUrl" in data.get("data", {}):
                    url = data["data"]["redirectUrl"]
                    _reserved_tickets_for_cleanup = [] # Clear cleanup list as they are now confirmed
                    print(f"Booking confirmed successfully! (Time taken: {time.time() - confirm_start:.2f}s)")
                    print("IMPORTANT: This payment link can be used ONLY ONCE.")
                    # Emit specialized JSON event for UI
                    builtins.print(json.dumps({"type": "payment_url", "url": url}), flush=True)
                else:
                    print(f"Failed to confirm: {r['b'][:200]}")
            except:
                print(f"Failed to parse confirm response: {r['b'][:200]}")
        else:
            print(f"{Fore.RED}Failed to confirm booking. Status: {r['s'] if r else 'No response'}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"{Fore.RED}An unexpected error occurred: {e}")
    finally:
        release_reserved_tickets("Process ended before booking confirmation.")

if __name__ == "__main__":
    main()
