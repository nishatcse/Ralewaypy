import os
import re
import sys
from datetime import datetime, timedelta
from colorama import Fore, Style, init

# Initialize colorama
init(autoreset=True)

# Constants for seat types
SEAT_TYPES = {
    "SHOVAN": "SHOVAN",
    "S_CHAIR": "S_CHAIR",
    "AC_S": "AC_S",
    "AC_B": "AC_B",
    "SNIGDHA": "SNIGDHA"
}

def load_env_file(file_path=".env"):
    """Load the .env file into a dictionary"""
    env_vars = {}
    
    try:
        with open(file_path, 'r') as file:
            for line in file:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                    
                if '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key] = value
    except FileNotFoundError:
        print(f"{Fore.RED}Error: .env file not found at {file_path}")
        sys.exit(1)
    
    return env_vars

def save_env_file(env_vars, file_path=".env"):
    """Save the dictionary back to the .env file, preserving comments and format"""
    try:
        # First read the original file to preserve comments and structure
        with open(file_path, 'r') as file:
            lines = file.readlines()
        
        # Update the values in the lines
        for i, line in enumerate(lines):
            if '=' in line and not line.strip().startswith('#'):
                key = line.split('=', 1)[0].strip()
                if key in env_vars:
                    lines[i] = f"{key}={env_vars[key]}\n"
        
        # Write back to the file
        with open(file_path, 'w') as file:
            file.writelines(lines)
            
        print(f"{Fore.GREEN}Configuration successfully updated!")
        
    except Exception as e:
        print(f"{Fore.RED}Error saving changes to .env file: {e}")
        sys.exit(1)

def get_date_input(prompt, current_value):
    """Get and validate date input"""
    while True:
        print(f"{Fore.CYAN}{prompt} (Current: {current_value})")
        print(f"{Fore.YELLOW}Format: dd-MMM-yyyy (e.g., 20-Mar-2025) or number of days from today")
        date_input = input(f"{Fore.CYAN}> ")
        
        # Keep current value if empty
        if not date_input:
            return current_value
            
        # Check if input is just a number of days
        if date_input.isdigit():
            days = int(date_input)
            new_date = (datetime.now() + timedelta(days=days)).strftime("%d-%b-%Y")
            print(f"{Fore.GREEN}Date set to {new_date} ({days} days from today)")
            return new_date
        else:
            # Validate date format
            try:
                # Attempt to parse the date to validate format
                datetime.strptime(date_input, "%d-%b-%Y")
                return date_input
            except ValueError:
                print(f"{Fore.RED}Invalid date format. Please use dd-MMM-yyyy (e.g., 20-Mar-2025)")

def get_seat_class_input(current_value):
    """Get and validate seat class input"""
    print(f"{Fore.CYAN}Select Seat Class (Current: {current_value})")
    print(f"{Fore.YELLOW}Available options: SHOVAN, S_CHAIR, AC_S, AC_B, SNIGDHA")
    
    while True:
        seat_class = input(f"{Fore.CYAN}> ").upper()
        
        # Keep current value if empty
        if not seat_class:
            return current_value
            
        if seat_class in SEAT_TYPES:
            return seat_class
        else:
            print(f"{Fore.RED}Invalid seat class. Please choose from: SHOVAN, S_CHAIR, AC_S, AC_B, SNIGDHA")

def get_max_seats_input(current_value):
    """Get and validate max seats input"""
    print(f"{Fore.CYAN}Enter Max Selectable Seats (1-4) (Current: {current_value})")
    
    while True:
        max_seats = input(f"{Fore.CYAN}> ")
        
        # Keep current value if empty
        if not max_seats:
            return current_value
            
        if max_seats.isdigit() and 1 <= int(max_seats) <= 4:
            return max_seats
        else:
            print(f"{Fore.RED}Invalid input. Please enter a number between 1 and 4.")

def get_seats_input(current_value):
    """Get and validate desired seats input"""
    print(f"{Fore.CYAN}Enter Desired Seats (comma-separated, e.g., JHA-23,JHA-24) (Current: {current_value})")
    print(f"{Fore.YELLOW}Leave empty to keep current setting")
    
    while True:
        seats = input(f"{Fore.CYAN}> ")
        
        # Keep current value if empty
        if not seats:
            return current_value
            
        # Simple validation: check for common patterns
        seat_pattern = re.compile(r'^[A-Z]{1,3}-\d{1,3}(,[A-Z]{1,3}-\d{1,3})*$')
        if seat_pattern.match(seats):
            return seats
        else:
            print(f"{Fore.RED}Invalid seat format. Please use format like JHA-23,JHA-24")

def get_time_input(current_value):
    """Get and validate time input in HH:MM:SS format"""
    default_time = "08:00:00"
    
    # If no current value, use default
    if not current_value:
        current_value = default_time
    
    # Display current value
    print(f"{Fore.CYAN}Target Time (Current: {current_value})")
    print(f"{Fore.YELLOW}Format: HH:MM:SS in 24-hour format (e.g., 08:00:00)")
    
    # Get user input
    while True:
        time_str = input(f"{Fore.CYAN}Target Time > ")
        
        # If empty, keep current
        if not time_str:
            return current_value
            
        # Validate time format
        try:
            # Check pattern HH:MM:SS
            if not re.match(r'^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$', time_str):
                print(f"{Fore.RED}Invalid time format. Use HH:MM:SS (24-hour)")
                continue
                
            # Valid time format
            return time_str
        except ValueError:
            print(f"{Fore.RED}Invalid time. Please use HH:MM:SS format.")

def update_config():
    """Update configuration values with simple prompts"""
    env_file_path = ".env"
    env_vars = load_env_file(env_file_path)
    
    # Display current settings
    print(f"{Fore.CYAN}=====================================")
    print(f"{Fore.YELLOW}      RAILWAY CONFIG UPDATER")
    print(f"{Fore.CYAN}=====================================")
    print("\nCurrent settings:")
    
    # Display credentials (with masked password)
    print(f"\n{Fore.CYAN}--- Credentials ---")
    print(f"{Fore.WHITE}Mobile Number: {Fore.GREEN}{env_vars.get('MOBILE_NUMBER', 'Not set')}")
    
    # Show masked password for security
    password = env_vars.get('PASSWORD', '')
    masked_password = '•' * len(password) if password else 'Not set'
    print(f"{Fore.WHITE}Password: {Fore.GREEN}{masked_password}")
    
    # Display other settings
    print(f"\n{Fore.CYAN}--- Travel Details ---")
    print(f"{Fore.WHITE}From: {Fore.GREEN}{env_vars.get('FROM_CITY', 'Not set')}")
    print(f"{Fore.WHITE}To: {Fore.GREEN}{env_vars.get('TO_CITY', 'Not set')}")
    print(f"{Fore.WHITE}Journey Date: {Fore.GREEN}{env_vars.get('DATE_OF_JOURNEY', 'Not set')}")
    print(f"{Fore.WHITE}Seat Class: {Fore.GREEN}{env_vars.get('SEAT_CLASS', 'Not set')}")
    print(f"{Fore.WHITE}Train Number: {Fore.GREEN}{env_vars.get('TRAIN_NUMBER', 'Not set')}")
    print(f"{Fore.WHITE}Max Selectable Seat: {Fore.GREEN}{env_vars.get('MAX_SELECTABLE_SEAT', 'Not set')}")
    print(f"{Fore.WHITE}Desired Seats: {Fore.GREEN}{env_vars.get('DESIRED_SEATS', 'Not set')}")
    
    # Display scheduler settings
    print(f"\n{Fore.CYAN}--- Scheduler Settings ---")
    print(f"{Fore.WHITE}Target Time: {Fore.GREEN}{env_vars.get('TARGET_TIME', '08:00:00')}")
    print(f"{Fore.CYAN}=====================================\n")
    
    # Get new values with simple prompts (empty input keeps current value)
    print(f"{Fore.YELLOW}Press Enter to keep current values or input new ones\n")
    
    # Credentials section
    print(f"{Fore.CYAN}--- Update Credentials ---")
    
    # Mobile Number
    mobile = input(f"{Fore.CYAN}Mobile Number (Current: {env_vars.get('MOBILE_NUMBER', '')}) > ")
    if mobile:
        # Simple validation for Bangladesh mobile numbers
        if re.match(r'^01\d{9}$', mobile):
            env_vars['MOBILE_NUMBER'] = mobile
        else:
            print(f"{Fore.RED}Invalid mobile number format. Expected format: 01XXXXXXXXX (11 digits)")
            mobile = input(f"{Fore.CYAN}Try again or press Enter to keep current value > ")
            if mobile and re.match(r'^01\d{9}$', mobile):
                env_vars['MOBILE_NUMBER'] = mobile
    
    # Password
    print(f"{Fore.YELLOW}Enter new password or press Enter to keep current")
    password = input(f"{Fore.CYAN}Password > ")
    if password:
        env_vars['PASSWORD'] = password
    
    print(f"\n{Fore.CYAN}--- Update Travel Details ---")
    
    # From City
    from_city = input(f"{Fore.CYAN}From City (Current: {env_vars.get('FROM_CITY', '')}) > ")
    if from_city:
        env_vars['FROM_CITY'] = from_city
    
    # To City
    to_city = input(f"{Fore.CYAN}To City (Current: {env_vars.get('TO_CITY', '')}) > ")
    if to_city:
        env_vars['TO_CITY'] = to_city
    
    # Journey Date
    env_vars['DATE_OF_JOURNEY'] = get_date_input(
        "Journey Date", 
        env_vars.get('DATE_OF_JOURNEY', '')
    )
    
    # Seat Class
    env_vars['SEAT_CLASS'] = get_seat_class_input(
        env_vars.get('SEAT_CLASS', '')
    )
    
    # Train Number
    train_number = input(f"{Fore.CYAN}Train Number (Current: {env_vars.get('TRAIN_NUMBER', '')}) > ")
    if train_number:
        env_vars['TRAIN_NUMBER'] = train_number
    
    # Max Selectable Seat
    env_vars['MAX_SELECTABLE_SEAT'] = get_max_seats_input(
        env_vars.get('MAX_SELECTABLE_SEAT', '1')
    )
    
    # Desired Seats
    env_vars['DESIRED_SEATS'] = get_seats_input(
        env_vars.get('DESIRED_SEATS', '')
    )
    
    print(f"\n{Fore.CYAN}--- Update Scheduler Settings ---")
    
    # Target Time
    env_vars['TARGET_TIME'] = get_time_input(
        env_vars.get('TARGET_TIME', '08:00:00')
    )
    
    # Confirm and save
    print(f"\n{Fore.WHITE}New settings:")
    print(f"{Fore.WHITE}Mobile Number: {Fore.GREEN}{env_vars.get('MOBILE_NUMBER', 'Not set')}")
    print(f"{Fore.WHITE}Password: {Fore.GREEN}{'•' * len(env_vars.get('PASSWORD', '')) if env_vars.get('PASSWORD', '') else 'Not set'}")
    print(f"{Fore.WHITE}From: {Fore.GREEN}{env_vars.get('FROM_CITY', 'Not set')}")
    print(f"{Fore.WHITE}To: {Fore.GREEN}{env_vars.get('TO_CITY', 'Not set')}")
    print(f"{Fore.WHITE}Journey Date: {Fore.GREEN}{env_vars.get('DATE_OF_JOURNEY', 'Not set')}")
    print(f"{Fore.WHITE}Seat Class: {Fore.GREEN}{env_vars.get('SEAT_CLASS', 'Not set')}")
    print(f"{Fore.WHITE}Train Number: {Fore.GREEN}{env_vars.get('TRAIN_NUMBER', 'Not set')}")
    print(f"{Fore.WHITE}Max Selectable Seat: {Fore.GREEN}{env_vars.get('MAX_SELECTABLE_SEAT', 'Not set')}")
    print(f"{Fore.WHITE}Desired Seats: {Fore.GREEN}{env_vars.get('DESIRED_SEATS', 'Not set')}")
    print(f"{Fore.WHITE}Target Time: {Fore.GREEN}{env_vars.get('TARGET_TIME', 'Not set')}")
    
    confirm = input(f"\n{Fore.YELLOW}Save these settings? (y/n) > ")
    if confirm.lower() == 'y':
        save_env_file(env_vars, env_file_path)
        print(f"{Fore.GREEN}Settings saved successfully!")
    else:
        print(f"{Fore.YELLOW}Changes discarded.")

def main():
    os.system('cls' if os.name == 'nt' else 'clear')  # Clear screen
    update_config()

if __name__ == "__main__":
    main()
