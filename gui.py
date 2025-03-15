import sys, os, requests, time, jwt, asyncio, re, builtins, threading
import aiohttp
from dotenv import load_dotenv, dotenv_values
from colorama import Fore, Style, init

# Initialize colorama
init(autoreset=True)

# Global events and variables for OTP and Payment input
otp_event = threading.Event()
OTP_VALUE = ""
payment_event = threading.Event()
PAYMENT_CHOICE = None

# ---------------------------
# Original Booking Code (functionality unchanged)
# ---------------------------
load_dotenv()

mobile_number = os.getenv("MOBILE_NUMBER")
password = os.getenv("PASSWORD")
from_city = os.getenv("FROM_CITY")
to_city = os.getenv("TO_CITY")
date_of_journey = os.getenv("DATE_OF_JOURNEY")
seat_class = os.getenv("SEAT_CLASS")
train_number = int(os.getenv("TRAIN_NUMBER"))
max_selectable_seat = int(os.getenv("MAX_SELECTABLE_SEAT"))
desired_seats = os.getenv("DESIRED_SEATS").split(',') if os.getenv("DESIRED_SEATS") else []

auth_key = None
headers = None
trip_id = None
trip_route_id = None
boarding_point_id = None
train_name = None
ticket_ids = []
reserved_ticket_ids = []  # kept as original

def fetch_auth_token(mobile_number, password):
    login_url = "https://railspaapi.shohoz.com/v1.0/app/auth/sign-in"
    payload = {"mobile_number": mobile_number, "password": password}
    while True:
        try:
            response = requests.post(login_url, json=payload)
            if response.status_code == 200:
                data = response.json()
                auth_token = data.get("data", {}).get("token")
                if auth_token:
                    print(f"✔ {Fore.GREEN}Authentication successful!{Style.RESET_ALL}")
                    print(f"➤ {Fore.MAGENTA}Auth Token: {auth_token}{Style.RESET_ALL}")
                    return auth_token
                else:
                    print(f"✖ {Fore.RED}Failed to retrieve token from response.{Style.RESET_ALL}")
                    return None
            elif response.status_code in [500, 502, 503, 504]:
                print(f"⌛ {Fore.YELLOW}Server overloaded (HTTP {response.status_code}). Retrying...{Style.RESET_ALL}")
                time.sleep(1)
            else:
                print(f"✖ {Fore.RED}Error: {response.status_code} - {response.text}{Style.RESET_ALL}")
                return None
        except requests.RequestException as e:
            print(f"✖ {Fore.RED}Exception occurred while fetching auth token: {e}{Style.RESET_ALL}")
            time.sleep(1)

def extract_user_info_from_token(auth_key):
    try:
        decoded_token = jwt.decode(auth_key, options={"verify_signature": False}, algorithms=["RS256"])
        user_email = decoded_token.get("email", "")
        user_phone = decoded_token.get("phone_number", "")
        user_name = decoded_token.get("display_name", "")
        print(f"➤ {Fore.CYAN}Extracted from token - Email: {user_email}, Phone: {user_phone}, Name: {user_name}{Style.RESET_ALL}")
        return user_email, user_phone, user_name
    except Exception as e:
        print(f"✖ {Fore.RED}Failed to decode auth token: {e}{Style.RESET_ALL}")
        return None, None, None

def fetch_trip_details(from_city, to_city, date_of_journey, seat_class, train_number, max_retries=60):
    url = "https://railspaapi.shohoz.com/v1.0/app/bookings/search-trips-v2"
    payload = {"from_city": from_city, "to_city": to_city, "date_of_journey": date_of_journey, "seat_class": seat_class}
    print(f"➤ {Fore.YELLOW}Fetching trip details for {from_city} to {to_city} on {date_of_journey}...{Style.RESET_ALL}")
    retries = 0
    while retries < max_retries:
        try:
            response = requests.get(url, headers=headers, params=payload)
            if response.status_code == 200:
                data = response.json().get("data", {}).get("trains", [])
                if not data:
                    print(f"⌛ {Fore.YELLOW}Trip details not available yet. Retrying in 1 second...{Style.RESET_ALL}")
                    retries += 1
                    time.sleep(1)
                    continue
                for train in data:
                    if train.get("train_model") == str(train_number):
                        for seat in train.get("seat_types", []):
                            if seat.get("type") == seat_class:
                                t_id = seat.get("trip_id")
                                t_route_id = seat.get("trip_route_id")
                                b_point_id = train.get("boarding_points", [{}])[0].get("trip_point_id", None)
                                t_name = train.get("trip_number")
                                print(f"✔ {Fore.GREEN}Trip details found! Train: {t_name}, Trip ID: {t_id}, Route ID: {t_route_id}, Boarding Point ID: {b_point_id}{Style.RESET_ALL}")
                                return t_id, t_route_id, b_point_id, t_name
                print(f"⌛ {Fore.YELLOW}Train number {train_number} with seat class {seat_class} not available yet. Retrying in 1 second...{Style.RESET_ALL}")
                retries += 1
                time.sleep(1)
            elif response.status_code in [500, 502, 503, 504]:
                print(f"⌛ {Fore.YELLOW}Server overloaded (HTTP {response.status_code}). Retrying in 1 second...{Style.RESET_ALL}")
                retries += 1
                time.sleep(1)
            else:
                print(f"✖ {Fore.RED}Failed to fetch trip details. HTTP Status: {response.status_code}{Style.RESET_ALL}")
                print(f"{Fore.CYAN}Server response: {response.text}{Style.RESET_ALL}")
                retries += 1
                time.sleep(1)
        except requests.RequestException as e:
            print(f"✖ {Fore.RED}Error during trip details fetch: {e}{Style.RESET_ALL}")
            retries += 1
            time.sleep(1)
    print(f"✖ {Fore.RED}Trip details not available after {max_retries} attempts. Exiting.{Style.RESET_ALL}")
    exit(1)

async def is_booking_available():
    url = "https://railspaapi.shohoz.com/v1.0/app/bookings/seat-layout"
    payload = {"trip_id": trip_id, "trip_route_id": trip_route_id}
    MIN_LOOP_INTERVAL = 0.001
    connector = aiohttp.TCPConnector(limit=20)
    async with aiohttp.ClientSession(connector=connector) as session:
        while True:
            start_time = time.perf_counter()
            try:
                async with session.get(url, headers=headers, json=payload) as response:
                    end_time = time.perf_counter()
                    elapsed = end_time - start_time
                    if response.status == 200:
                        data = await response.json()
                        if "seatLayout" in data.get("data", {}):
                            print(f"✔ {Fore.GREEN}Booking is now available!{Style.RESET_ALL}")
                            return data["data"]["seatLayout"]
                    elif response.status in [500, 502, 503, 504]:
                        print(f"⌛ {Fore.YELLOW}Server overloaded (HTTP {response.status}). Retrying...{Style.RESET_ALL}")
                    elif response.status == 422:
                        error_data = await response.json()
                        error_messages = error_data.get("error", {}).get("messages", "")
                        error_message = ""
                        error_key = ""
                        if isinstance(error_messages, list):
                            error_message = error_messages[0]
                        elif isinstance(error_messages, dict):
                            error_message = error_messages.get("message", "")
                            error_key = error_messages.get("errorKey", "")
                        else:
                            error_message = "Unknown error."
                        print(f"{Fore.CYAN}Server response: {error_data}{Style.RESET_ALL}")
                        if "ticket purchase for this trip will be available" in error_message:
                            print(f"⌛ {Fore.YELLOW}Booking is not open yet: {error_message}. Retrying...{Style.RESET_ALL}")
                            await asyncio.sleep(MIN_LOOP_INTERVAL)
                            continue
                        if error_key == "OrderLimitExceeded":
                            print(f"✖ {Fore.RED}Error: Maximum booking limit reached for {from_city} to {to_city} on {date_of_journey} for {train_name}.{Style.RESET_ALL}")
                        else:
                            time_match = re.search(r"(\d+)\s*minute[s]?\s*(\d+)\s*second[s]?", error_message, re.IGNORECASE)
                            if time_match:
                                minutes = int(time_match.group(1))
                                seconds = int(time_match.group(2))
                                total_seconds = minutes * 60 + seconds
                                current_time_formatted = time.strftime("%I:%M:%S %p", time.localtime())
                                future_time_formatted = time.strftime("%I:%M:%S %p", time.localtime(time.time() + total_seconds))
                                print(f"✖ {Fore.RED}Error: {error_message} Current time: {current_time_formatted}. Try after: {future_time_formatted}.{Style.RESET_ALL}")
                            else:
                                print(f"✖ {Fore.YELLOW}{error_message} Please try again later.{Style.RESET_ALL}")
                        exit()
                    else:
                        print(f"✖ {Fore.RED}Failed to check booking availability. HTTP Status: {response.status}{Style.RESET_ALL}")
                        text_resp = await response.text()
                        print(f"{Fore.CYAN}Server response: {text_resp}{Style.RESET_ALL}")
            except aiohttp.ClientError as e:
                end_time = time.perf_counter()
                elapsed = end_time - start_time
                print(f"✖ {Fore.RED}An error occurred while checking booking availability: {e}{Style.RESET_ALL}")
            if elapsed < MIN_LOOP_INTERVAL:
                await asyncio.sleep(MIN_LOOP_INTERVAL - elapsed)

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
                                    if len(selected_seat_details) == max_selectable_seat:
                                        return selected_seat_details
                            if desired_index - offset >= 0:
                                seat = seat_numbers[desired_index - offset]
                                if seat['seat_availability'] == 1 and seat['seat_number'] not in selected_seat_details.values():
                                    selected_seat_details[seat['ticket_id']] = seat['seat_number']
                                    if len(selected_seat_details) == max_selectable_seat:
                                        return selected_seat_details
    for coach in seat_layout:
        for row in coach["layout"]:
            for seat in row:
                if seat["seat_availability"] == 1 and seat["seat_number"] not in selected_seat_details.values():
                    selected_seat_details[seat["ticket_id"]] = seat["seat_number"]
                    if len(selected_seat_details) == max_selectable_seat:
                        return selected_seat_details
    selected_seats = []
    all_available_seats = []
    coach_selected_seats = []
    seats = []
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
        right = 0
        if right < len(seats) and len(selected_seats) < max_selectable_seat:
            coach_selected_seats.append(seats[right])
            selected_seats.append(seats[right])
            right += 1
    if coach_selected_seats:
        for seat in coach_selected_seats:
            selected_seat_details[seat["ticket_id"]] = seat["seat_number"]
            if len(selected_seat_details) == max_selectable_seat:
                return selected_seat_details
    if len(selected_seats) < max_selectable_seat:
        for coach_data in all_available_seats:
            if len(selected_seats) >= max_selectable_seat:
                break
            seats = coach_data["seats"]
            for seat in seats:
                if len(selected_seats) >= max_selectable_seat:
                    break
                if seat not in selected_seat_details.values():
                    selected_seat_details[seat["ticket_id"]] = seat["seat_number"]
                    selected_seats.append(seat)
    if selected_seat_details:
        print(f"➤ {Fore.YELLOW}Warning: Proceeding with {len(selected_seat_details)} seats instead of {max_selectable_seat}{Style.RESET_ALL}")
        return selected_seat_details
    print(f"✖ {Fore.RED}No seats available to proceed.{Style.RESET_ALL}")
    return None

def prepare_confirm_payload(otp):
    user_email, user_phone, user_name = extract_user_info_from_token(auth_key)
    if len(ticket_ids) > 1:
        passenger_names = [user_name]
        for i in range(1, len(ticket_ids)):
            passenger_name = input(f"{Fore.YELLOW}Enter passenger {i + 1} name: ")
            passenger_names.append(passenger_name)
        confirm_payload = {
            "is_bkash_online": True,
            "boarding_point_id": boarding_point_id,
            "from_city": from_city,
            "to_city": to_city,
            "date_of_journey": date_of_journey,
            "seat_class": seat_class,
            "passengerType": ["Adult"] * len(ticket_ids),
            "gender": ["Male"] * len(ticket_ids),
            "pname": passenger_names,
            "pmobile": user_phone,
            "pemail": user_email,
            "trip_id": trip_id,
            "trip_route_id": trip_route_id,
            "ticket_ids": ticket_ids,
            "contactperson": 0,
            "otp": otp,
            "selected_mobile_transaction": 1
        }
    else:
        confirm_payload = {
            "is_bkash_online": True,
            "boarding_point_id": boarding_point_id,
            "from_city": from_city,
            "to_city": to_city,
            "date_of_journey": date_of_journey,
            "seat_class": seat_class,
            "passengerType": ["Adult"],
            "gender": ["Male"],
            "pname": [user_name],
            "pmobile": user_phone,
            "pemail": user_email,
            "trip_id": trip_id,
            "trip_route_id": trip_route_id,
            "ticket_ids": ticket_ids,
            "contactperson": 0,
            "otp": otp,
            "selected_mobile_transaction": 1
        }
    return confirm_payload

def reserve_seat():
    global ticket_ids
    print(f"⌛ {Fore.YELLOW}Waiting for seat layout availability...{Style.RESET_ALL}")
    seat_layout = asyncio.run(is_booking_available())
    if not seat_layout:
        print(f"✖ {Fore.RED}Seat layout could not be retrieved. Exiting.{Style.RESET_ALL}")
        return False
    ticket_id_map = get_ticket_ids_from_layout(seat_layout, desired_seats, max_selectable_seat)
    if not ticket_id_map:
        print(f"✖ {Fore.RED}No matching seats found based on desired preferences. Exiting.{Style.RESET_ALL}")
        return False
    ticket_ids = list(ticket_id_map.keys())
    print(f"➤ {Fore.GREEN}Seats matched! Details: {', '.join([f'{ticket_id_map[ticket]} (Ticket ID: {ticket})' for ticket in ticket_ids])}{Style.RESET_ALL}")
    successful_ticket_ids = []
    stop_reservation_due_to_limit = False
    def reserve_single_seat(ticket):
        nonlocal stop_reservation_due_to_limit
        if stop_reservation_due_to_limit:
            return False
        url = f"https://railspaapi.shohoz.com/v1.0/app/bookings/reserve-seat"
        params = {"ticket_id": ticket, "route_id": trip_route_id}
        print(f"➤ {Fore.CYAN}Attempting to reserve Seat {ticket_id_map[ticket]} (Ticket ID: {ticket})...{Style.RESET_ALL}")
        while True:
            try:
                response = requests.patch(url, headers=headers, json=params)
                print(f"➤ {Fore.CYAN}Response for Seat {ticket_id_map[ticket]} (Ticket ID: {ticket}): {response.text}{Style.RESET_ALL}")
                if response.status_code == 200:
                    data = response.json()
                    if data["data"].get("ack") == 1:
                        print(f"✔ {Fore.GREEN}Seat {ticket_id_map[ticket]} (Ticket ID: {ticket}) reserved successfully!{Style.RESET_ALL}")
                        successful_ticket_ids.append(ticket)
                        return True
                    else:
                        print(f"✖ {Fore.RED}Failed to reserve seat {ticket_id_map[ticket]} (Ticket ID: {ticket}): {data}{Style.RESET_ALL}")
                        return False
                elif response.status_code == 422:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("messages", {}).get("error_msg", "")
                    if "Maximum 4 seats can be booked at a time" in error_msg:
                        print(f"✖ {Fore.RED}Error: {error_msg}. Stopping further seat reservation.{Style.RESET_ALL}")
                        stop_reservation_due_to_limit = True
                        return False
                    elif "Sorry! this ticket is not available now." in error_msg:
                        print(f"✖ {Fore.RED}Seat {ticket_id_map[ticket]} (Ticket ID: {ticket}) is not available now. Skipping retry.{Style.RESET_ALL}")
                        return False
                elif response.status_code in [500, 502, 503, 504]:
                    print(f"⌛ {Fore.YELLOW}Server overloaded (HTTP {response.status_code}). Retrying in 100 ms...{Style.RESET_ALL}")
                    time.sleep(0.1)
                else:
                    print(f"✖ {Fore.RED}Error: {response.status_code} - {response.text}{Style.RESET_ALL}")
                    return False
            except Exception as e:
                print(f"✖ {Fore.RED}Exception while reserving seat {ticket_id_map[ticket]} (Ticket ID: {ticket}): {e}{Style.RESET_ALL}")
                time.sleep(0.1)
    for ticket in ticket_ids:
        if reserve_single_seat(ticket):
            print(f"✔ {Fore.GREEN}Successfully reserved seat {ticket_id_map[ticket]}{Style.RESET_ALL}")
        else:
            print(f"✖ {Fore.RED}Failed to reserve seat {ticket_id_map[ticket]}{Style.RESET_ALL}")
    if successful_ticket_ids:
        global reserved_ticket_ids
        reserved_ticket_ids = successful_ticket_ids
        print(f"✔ {Fore.GREEN}Successfully reserved {len(successful_ticket_ids)} seats: {', '.join([ticket_id_map[ticket] for ticket in successful_ticket_ids])}{Style.RESET_ALL}")
        return True
    else:
        print(f"✖ {Fore.RED}No seats could be reserved. Please try again.{Style.RESET_ALL}")
        return False

def send_passenger_details():
    url = "https://railspaapi.shohoz.com/v1.0/app/bookings/passenger-details"
    payload = {"trip_id": trip_id, "trip_route_id": trip_route_id, "ticket_ids": ticket_ids}
    while True:
        try:
            response = requests.post(url, headers=headers, json=payload)
            print(f"➤ {Fore.CYAN}Response from Passenger Details API: {response.text}{Style.RESET_ALL}")
            if response.status_code == 200:
                data = response.json()
                if data["data"]["success"]:
                    print(f"✔ {Fore.GREEN}OTP sent successfully!{Style.RESET_ALL}")
                    return True
                else:
                    print(f"✖ {Fore.RED}Failed to send OTP: {data}{Style.RESET_ALL}")
                    return False
            elif response.status_code in [500, 502, 503, 504]:
                print(f"⌛ {Fore.YELLOW}Server overloaded (HTTP {response.status_code}). Retrying in 1 second...{Style.RESET_ALL}")
                time.sleep(1)
            else:
                print(f"✖ {Fore.RED}Error: {response.status_code} - {response.text}{Style.RESET_ALL}")
                return False
        except requests.RequestException as e:
            print(f"✖ {Fore.RED}Exception while sending passenger details: {e}{Style.RESET_ALL}")
            time.sleep(1)

def verify_and_confirm_booking(otp):
    verify_url = "https://railspaapi.shohoz.com/v1.0/app/bookings/verify-otp"
    verify_payload = {"trip_id": trip_id, "trip_route_id": trip_route_id, "ticket_ids": ticket_ids, "otp": otp}
    try:
        while True:
            response = requests.post(verify_url, headers=headers, json=verify_payload)
            print(f"➤ {Fore.CYAN}Response from OTP Verification API: {response.text}{Style.RESET_ALL}")
            if response.status_code == 200:
                data = response.json()
                if not data["data"]["success"]:
                    print(f"✖ {Fore.RED}Failed to verify OTP: {data}{Style.RESET_ALL}")
                    return False
                print(f"✔ {Fore.GREEN}OTP verified successfully!{Style.RESET_ALL}")
                break
            elif response.status_code in [500, 502, 503, 504]:
                print(f"⌛ {Fore.YELLOW}Server overloaded (HTTP {response.status}). Retrying in 1 second...{Style.RESET_ALL}")
                time.sleep(1)
            elif response.status_code == 422:
                data = response.json()
                error_message = data.get("error", {}).get("messages", {}).get("message", "Unknown error")
                error_key = data.get("error", {}).get("messages", {}).get("errorKey", "Unknown errorKey")
                print(f"✖ {Fore.RED}Error: {error_message} (ErrorKey: {error_key}){Style.RESET_ALL}")
                if error_key == "OtpNotVerified":
                    otp = input(f"{Fore.YELLOW}The OTP does not match. Please enter the correct OTP: {Style.RESET_ALL}")
                    verify_payload["otp"] = otp
                else:
                    return False
            else:
                print(f"✖ {Fore.RED}Error: {response.status_code} - {response.text}{Style.RESET_ALL}")
                return False
    except Exception as e:
        print(f"✖ {Fore.RED}Exception occurred: {e}{Style.RESET_ALL}")
        time.sleep(1)
        return False
    # Instead of using input(), use Payment Panel from GUI.
    from PyQt6.QtCore import QMetaObject, Qt
    print(f"➤ {Fore.CYAN}Waiting for Payment Method input from GUI panel...{Style.RESET_ALL}")
    # Signal GUI to show payment panel
    ui_update.showPaymentPanel.emit()
    payment_event.wait()
    payment_choice = PAYMENT_CHOICE
    payment_event.clear()
    # Build confirm_payload based on payment_choice
    confirm_payload = prepare_confirm_payload(otp)
    if payment_choice == 2:
        confirm_payload["is_bkash_online"] = False
        confirm_payload["selected_mobile_transaction"] = 3
    elif payment_choice == 3:
        confirm_payload["is_bkash_online"] = False
        confirm_payload["selected_mobile_transaction"] = 4
    elif payment_choice == 4:
        confirm_payload["is_bkash_online"] = False
        confirm_payload["selected_mobile_transaction"] = 5
    elif payment_choice == 5:
        confirm_payload["is_bkash_online"] = False
        confirm_payload.pop("selected_mobile_transaction", None)
        confirm_payload["pg"] = "visa"
    elif payment_choice == 6:
        confirm_payload["is_bkash_online"] = False
        confirm_payload.pop("selected_mobile_transaction", None)
        confirm_payload["pg"] = "mastercard"
    elif payment_choice == 7:
        confirm_payload["is_bkash_online"] = False
        confirm_payload.pop("selected_mobile_transaction", None)
        confirm_payload["pg"] = "nexus"
    confirm_url = "https://railspaapi.shohoz.com/v1.0/app/bookings/confirm"
    print(f"➤ {Fore.CYAN}Processing payment...{Style.RESET_ALL}")
    while True:
        try:
            response = requests.patch(confirm_url, headers=headers, json=confirm_payload)
            print(f"➤ {Fore.CYAN}Response from Confirm Booking API: {response.text}{Style.RESET_ALL}")
            if response.status_code == 200:
                data = response.json()
                if "redirectUrl" in data["data"]:
                    redirect_url = data["data"]["redirectUrl"]
                    print(f"\n{Fore.GREEN}{'='*50}")
                    print(f"✔ {Fore.GREEN}Booking confirmed successfully!")
                    print(f"➤ {Fore.YELLOW}IMPORTANT: This payment link can be used ONLY ONCE.")
                    print(f"⇨ {Fore.BLUE}Payment URL: {redirect_url}")
                    print(f"{'='*50}{Style.RESET_ALL}\n")
                    return True
                else:
                    print(f"✖ {Fore.RED}Failed to confirm booking: {data}{Style.RESET_ALL}")
                    return False
            elif response.status_code in [500, 502, 503, 504]:
                print(f"⌛ {Fore.YELLOW}Server overloaded (HTTP {response.status_code}). Retrying in 1 second...{Style.RESET_ALL}")
                time.sleep(1)
            else:
                print(f"✖ {Fore.RED}Error: {response.status_code} - {response.text}{Style.RESET_ALL}")
                return False
        except requests.RequestException as e:
            print(f"✖ {Fore.RED}Exception while confirming booking: {e}{Style.RESET_ALL}")
            time.sleep(1)
            return False

def booking_process():
    try:
        print(f"➤ {Fore.CYAN}Starting ticket booking process...{Style.RESET_ALL}")
        global auth_key, headers, trip_id, trip_route_id, boarding_point_id, train_name
        auth_key = fetch_auth_token(mobile_number, password)
        if auth_key:
            headers = {"Authorization": f"Bearer {auth_key}"}
        else:
            print(f"✖ {Fore.RED}Failed to fetch auth token. Exiting.{Style.RESET_ALL}")
            return
        trip_id, trip_route_id, boarding_point_id, train_name = fetch_trip_details(
            from_city, to_city, date_of_journey, seat_class, train_number
        )
        if not trip_id or not trip_route_id or not boarding_point_id:
            print(f"✖ {Fore.RED}Error: Could not fetch trip details. Please check your inputs.{Style.RESET_ALL}")
            return
        if reserve_seat():
            if send_passenger_details():
                print(f"➤ {Fore.CYAN}Proceeding to OTP verification and confirmation...{Style.RESET_ALL}")
                print(f"⌛ {Fore.YELLOW}Waiting for OTP input from the GUI panel...{Style.RESET_ALL}")
                otp_event.wait()  # Wait for OTP from the OTP panel
                otp = OTP_VALUE
                otp_event.clear()
                if verify_and_confirm_booking(otp):
                    print(f"✔ {Fore.GREEN}Booking process completed successfully!{Style.RESET_ALL}")
                    record_history()
                else:
                    print(f"✖ {Fore.RED}Failed to complete booking process.{Style.RESET_ALL}")
            else:
                print(f"✖ {Fore.RED}Failed to send passenger details and get OTP.{Style.RESET_ALL}")
        else:
            print(f"✖ {Fore.RED}Failed to reserve the seat.{Style.RESET_ALL}")
    except Exception as e:
        print(f"✖ {Fore.RED}An unexpected error occurred: {e}{Style.RESET_ALL}")

def record_history():
    user_email, user_phone, user_name = extract_user_info_from_token(auth_key)
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    entry = f"{timestamp} | {user_name} ({user_email}) | {from_city} -> {to_city} on {date_of_journey} | Train: {train_name}\n"
    try:
        with open("history.txt", "a", encoding="utf-8") as f:
            f.write(entry)
        print(f"✔ {Fore.GREEN}Booking history recorded.{Style.RESET_ALL}")
    except Exception as e:
        print(f"✖ {Fore.RED}Failed to record booking history: {e}{Style.RESET_ALL}")

def load_env_file(file_path=".env"):
    env_vars = {}
    try:
        with open(file_path, 'r') as file:
            for line in file:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
    except FileNotFoundError:
        print(f"✖ {Fore.RED}Error: .env file not found at {file_path}{Style.RESET_ALL}")
        sys.exit(1)
    return env_vars

def save_env_file(env_vars, file_path=".env"):
    try:
        with open(file_path, 'r') as file:
            lines = file.readlines()
        for i, line in enumerate(lines):
            if '=' in line and not line.strip().startswith('#'):
                key = line.split('=', 1)[0].strip()
                if key in env_vars:
                    lines[i] = f"{key}={env_vars[key]}\n"
        with open(file_path, 'w') as file:
            file.writelines(lines)
        print(f"✔ {Fore.GREEN}Configuration successfully updated!{Style.RESET_ALL}")
    except Exception as e:
        print(f"✖ {Fore.RED}Error saving changes to .env file: {e}{Style.RESET_ALL}")
        sys.exit(1)

# ---------------------------
# UI Update Signals for Payment Panel
# ---------------------------
from PyQt6.QtCore import QObject, pyqtSignal

class UIUpdate(QObject):
    showPaymentPanel = pyqtSignal()
    hidePaymentPanel = pyqtSignal()

ui_update = UIUpdate()

# ---------------------------
# GUI Code Using PyQt6 with Tabs: Booking, Configuration, History
# ---------------------------
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QPushButton,
    QTextEdit, QInputDialog, QLineEdit, QLabel, QFormLayout, QTabWidget, QMessageBox, QHBoxLayout, QComboBox
)
from PyQt6.QtCore import QThread, pyqtSignal

class EmittingStream(QObject):
    textWritten = pyqtSignal(str)
    def write(self, text):
        clean_text = re.sub(r'\x1B[@-_][0-?]*[ -/]*[@-~]', '', text)
        self.textWritten.emit(clean_text)
        with open("booking.log", "a", encoding="utf-8") as f:
            f.write(text)
    def flush(self):
        pass

def gui_input(prompt):
    result, ok = QInputDialog.getText(QApplication.activeWindow(), "Input", prompt)
    if ok:
        return result
    else:
        return ""
builtins.input = gui_input

class BookingWorker(QThread):
    finished = pyqtSignal()
    def run(self):
        booking_process()
        self.finished.emit()

class BookingTab(QWidget):
    def __init__(self):
        super().__init__()
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        btn_layout = QHBoxLayout()
        self.startButton = QPushButton("Start Booking Process")
        self.stopButton = QPushButton("Stop Booking")
        btn_layout.addWidget(self.startButton)
        btn_layout.addWidget(self.stopButton)
        layout.addLayout(btn_layout)
        self.logTextEdit = QTextEdit()
        self.logTextEdit.setReadOnly(True)
        # OTP Panel
        otp_layout = QHBoxLayout()
        self.otpLabel = QLabel("OTP:")
        self.otpLineEdit = QLineEdit()
        self.otpConfirmButton = QPushButton("Confirm OTP")
        otp_layout.addWidget(self.otpLabel)
        otp_layout.addWidget(self.otpLineEdit)
        otp_layout.addWidget(self.otpConfirmButton)
        # Payment Panel (initially hidden)
        payment_layout = QHBoxLayout()
        self.paymentLabel = QLabel("Payment Method:")
        self.paymentCombo = QComboBox()
        self.paymentCombo.addItems(["Bkash", "Nagad", "Rocket", "Upay", "VISA", "Mastercard", "DBBL Nexus"])
        self.paymentConfirmButton = QPushButton("Confirm Payment")
        payment_layout.addWidget(self.paymentLabel)
        payment_layout.addWidget(self.paymentCombo)
        payment_layout.addWidget(self.paymentConfirmButton)
        self.paymentLabel.hide()
        self.paymentCombo.hide()
        self.paymentConfirmButton.hide()
        layout.addWidget(self.logTextEdit)
        layout.addLayout(otp_layout)
        layout.addLayout(payment_layout)
        self.startButton.clicked.connect(self.start_booking)
        self.stopButton.clicked.connect(self.stop_booking)
        self.otpConfirmButton.clicked.connect(self.confirm_otp)
        self.paymentConfirmButton.clicked.connect(self.confirm_payment)
        self.worker = None
        # Connect UI update signals
        ui_update.showPaymentPanel.connect(self.show_payment_panel)
        ui_update.hidePaymentPanel.connect(self.hide_payment_panel)

    def append_log(self, text):
        self.logTextEdit.append(text)

    def start_booking(self):
        self.startButton.setEnabled(False)
        # Enable OTP panel initially (it will be used when needed)
        self.otpLabel.setEnabled(True)
        self.otpLineEdit.setEnabled(True)
        self.otpConfirmButton.setEnabled(True)
        self.worker = BookingWorker()
        self.worker.finished.connect(self.on_finished)
        self.worker.start()

    def stop_booking(self):
        if self.worker and self.worker.isRunning():
            self.worker.terminate()
            self.append_log("✖ Booking process stopped by user.")
            self.startButton.setEnabled(True)

    def confirm_otp(self):
        otp = self.otpLineEdit.text().strip()
        if otp:
            global OTP_VALUE
            OTP_VALUE = otp
            otp_event.set()
            self.append_log("✔ OTP confirmed by user.")
            # Once OTP is confirmed, request payment panel to show
            ui_update.showPaymentPanel.emit()

    def confirm_payment(self):
        global PAYMENT_CHOICE
        PAYMENT_CHOICE = self.paymentCombo.currentIndex() + 1
        payment_event.set()
        self.append_log(f"✔ Payment method '{self.paymentCombo.currentText()}' confirmed by user.")
        ui_update.hidePaymentPanel.emit()

    def show_payment_panel(self):
        self.paymentLabel.show()
        self.paymentCombo.show()
        self.paymentConfirmButton.show()

    def hide_payment_panel(self):
        self.paymentLabel.hide()
        self.paymentCombo.hide()
        self.paymentConfirmButton.hide()

    def on_finished(self):
        self.startButton.setEnabled(True)
        self.otpLabel.setEnabled(False)
        self.otpLineEdit.setEnabled(False)
        self.otpConfirmButton.setEnabled(False)
        ui_update.hidePaymentPanel.emit()

class ConfigTab(QWidget):
    def __init__(self):
        super().__init__()
        self.env_file = ".env"
        self.env_vars = load_env_file(self.env_file)
        self.init_ui()

    def init_ui(self):
        layout = QFormLayout(self)
        self.fields = {}
        keys = ["MOBILE_NUMBER", "PASSWORD", "FROM_CITY", "TO_CITY",
                "DATE_OF_JOURNEY", "SEAT_CLASS", "TRAIN_NUMBER",
                "MAX_SELECTABLE_SEAT", "DESIRED_SEATS", "TARGET_TIME"]
        for key in keys:
            label = QLabel(key)
            line_edit = QLineEdit()
            line_edit.setText(self.env_vars.get(key, ""))
            self.fields[key] = line_edit
            layout.addRow(label, line_edit)
        self.saveButton = QPushButton("Save Configuration")
        layout.addRow(self.saveButton)
        self.saveButton.clicked.connect(self.save_config)

    def save_config(self):
        for key, field in self.fields.items():
            self.env_vars[key] = field.text().strip()
        try:
            save_env_file(self.env_vars, self.env_file)
            QMessageBox.information(self, "Success", "Configuration successfully updated!")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to save configuration: {e}")

class HistoryTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout(self)
        self.historyTextEdit = QTextEdit()
        self.historyTextEdit.setReadOnly(True)
        btn_layout = QHBoxLayout()
        self.refreshButton = QPushButton("Refresh Log")
        self.clearButton = QPushButton("Clear Log")
        btn_layout.addWidget(self.refreshButton)
        btn_layout.addWidget(self.clearButton)
        layout.addLayout(btn_layout)
        layout.addWidget(self.historyTextEdit)
        self.refreshButton.clicked.connect(self.load_history)
        self.clearButton.clicked.connect(self.clear_history)
        self.load_history()

    def load_history(self):
        if os.path.exists("booking.log"):
            try:
                with open("booking.log", "r", encoding="utf-8") as f:
                    content = f.read()
                self.historyTextEdit.setPlainText(content)
            except Exception as e:
                self.historyTextEdit.setPlainText(f"✖ Error loading log: {e}")
        else:
            self.historyTextEdit.setPlainText("No log available.")

    def clear_history(self):
        reply = QMessageBox.question(self, "Clear Log", "Are you sure you want to clear the log?",
                                     QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.Yes:
            try:
                with open("booking.log", "w", encoding="utf-8") as f:
                    f.write("")
                self.historyTextEdit.setPlainText("")
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to clear log: {e}")

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Ticket Booking System")
        self.resize(900, 700)
        self.tabs = QTabWidget()
        self.bookingTab = BookingTab()
        self.configTab = ConfigTab()
        self.historyTab = HistoryTab()
        self.tabs.addTab(self.bookingTab, "Booking")
        self.tabs.addTab(self.configTab, "Configuration")
        self.tabs.addTab(self.historyTab, "Log History")
        self.setCentralWidget(self.tabs)
        # Modern light theme styling
        self.setStyleSheet("""
            QMainWindow { background-color: #ffffff; }
            QTextEdit { background-color: #f4f4f4; color: #333333; font-family: "Segoe UI", sans-serif; font-size: 11pt; }
            QPushButton { background-color: #007ACC; color: #ffffff; border: none; padding: 8px 16px; border-radius: 4px; }
            QPushButton:hover { background-color: #005F99; }
            QLineEdit { background-color: #ffffff; color: #333333; }
            QLabel { color: #333333; font-family: "Segoe UI", sans-serif; }
            QTabWidget::pane { border: 1px solid #cccccc; }
            QTabBar::tab { background: #e0e0e0; color: #333333; padding: 8px; margin: 2px; border-top-left-radius: 4px; border-top-right-radius: 4px; }
            QTabBar::tab:selected { background: #ffffff; border-bottom: 2px solid #007ACC; }
        """)

if __name__ == "__main__":
    from PyQt6.QtWidgets import QApplication
    app = QApplication(sys.argv)
    mainWin = MainWindow()
    sys.stdout = EmittingStream()
    sys.stdout.textWritten.connect(mainWin.bookingTab.append_log)
    mainWin.show()
    sys.exit(app.exec())
