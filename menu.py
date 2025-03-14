import os
import sys
import subprocess
from colorama import Fore, Style, init
import time

# Initialize colorama
init(autoreset=True)

def clear_screen():
    """Clear terminal screen based on OS."""
    os.system('cls' if os.name == 'nt' else 'clear')

def display_header():
    """Display application header."""
    clear_screen()
    print(f"{Fore.CYAN}=====================================")
    print(f"{Fore.YELLOW}  BANGLADESH RAILWAY BOOKING SYSTEM")
    print(f"{Fore.CYAN}=====================================")
    print(f"{Fore.WHITE}        Main Menu\n")

def display_menu():
    """Display main menu options."""
    print(f"{Fore.CYAN}[1] {Fore.WHITE}Book Tickets Now")
    print(f"{Fore.CYAN}[2] {Fore.WHITE}Schedule Booking")
    print(f"{Fore.CYAN}[3] {Fore.WHITE}Update Configuration")
    print(f"{Fore.CYAN}[4] {Fore.WHITE}Test Authentication")
    print(f"{Fore.CYAN}[5] {Fore.WHITE}View Current Settings")
    print(f"{Fore.CYAN}[0] {Fore.WHITE}Exit")
    print(f"\n{Fore.CYAN}=====================================\n")

def run_program(program, wait=True):
    """Run a Python program and handle its execution."""
    try:
        print(f"{Fore.YELLOW}Starting {program}...\n")
        
        # Run the program
        if wait:
            # Run and wait for completion
            subprocess.run([sys.executable, program], check=True)
            input(f"\n{Fore.GREEN}Program completed. Press Enter to return to menu...")
        else:
            # Just start the program and return to menu
            subprocess.Popen([sys.executable, program])
            print(f"{Fore.GREEN}Program started in a new process.")
            time.sleep(1)  # Brief pause to see the message
    except subprocess.CalledProcessError:
        print(f"{Fore.RED}Error running {program}")
        input("Press Enter to continue...")
    except FileNotFoundError:
        print(f"{Fore.RED}Error: {program} not found!")
        input("Press Enter to continue...")

def view_settings():
    """Display current configuration settings."""
    try:
        # Read .env file
        env_file = ".env"
        settings = {}
        
        if os.path.exists(env_file):
            with open(env_file, 'r') as file:
                for line in file:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    if '=' in line:
                        key, value = line.split('=', 1)
                        settings[key] = value
            
            # Display settings in categories
            clear_screen()
            print(f"{Fore.CYAN}=====================================")
            print(f"{Fore.YELLOW}      CURRENT CONFIGURATION")
            print(f"{Fore.CYAN}=====================================")
            
            # Credentials (mask password)
            print(f"\n{Fore.CYAN}--- Credentials ---")
            print(f"{Fore.WHITE}Mobile Number: {Fore.GREEN}{settings.get('MOBILE_NUMBER', 'Not set')}")
            password = settings.get('PASSWORD', '')
            masked_password = '•' * len(password) if password else 'Not set'
            print(f"{Fore.WHITE}Password: {Fore.GREEN}{masked_password}")
            
            # Travel Details
            print(f"\n{Fore.CYAN}--- Travel Details ---")
            print(f"{Fore.WHITE}From: {Fore.GREEN}{settings.get('FROM_CITY', 'Not set')}")
            print(f"{Fore.WHITE}To: {Fore.GREEN}{settings.get('TO_CITY', 'Not set')}")
            print(f"{Fore.WHITE}Journey Date: {Fore.GREEN}{settings.get('DATE_OF_JOURNEY', 'Not set')}")
            print(f"{Fore.WHITE}Seat Class: {Fore.GREEN}{settings.get('SEAT_CLASS', 'Not set')}")
            print(f"{Fore.WHITE}Train Number: {Fore.GREEN}{settings.get('TRAIN_NUMBER', 'Not set')}")
            print(f"{Fore.WHITE}Max Selectable Seat: {Fore.GREEN}{settings.get('MAX_SELECTABLE_SEAT', 'Not set')}")
            print(f"{Fore.WHITE}Desired Seats: {Fore.GREEN}{settings.get('DESIRED_SEATS', 'Not set')}")
            
            # Scheduler Settings
            print(f"\n{Fore.CYAN}--- Scheduler Settings ---")
            print(f"{Fore.WHITE}Target Time: {Fore.GREEN}{settings.get('TARGET_TIME', '08:00:00')}")
            
            print(f"\n{Fore.CYAN}=====================================")
            input(f"\n{Fore.YELLOW}Press Enter to return to menu...")
        else:
            print(f"{Fore.RED}Error: .env file not found!")
            input("Press Enter to continue...")
    except Exception as e:
        print(f"{Fore.RED}Error reading settings: {e}")
        input("Press Enter to continue...")

def main():
    """Main function to handle the menu system."""
    while True:
        display_header()
        display_menu()
        
        choice = input(f"{Fore.CYAN}Enter your choice (0-5): {Fore.WHITE}")
        
        if choice == '1':
            # Book tickets now (app.py)
            run_program("app.py")
        elif choice == '2':
            # Schedule booking (scheduler.py)
            run_program("scheduler.py")
        elif choice == '3':
            # Update configuration (config_updater.py)
            run_program("config_updater.py")
        elif choice == '4':
            # Test authentication (test_auth.py)
            run_program("test_auth.py")
        elif choice == '5':
            # View current settings
            view_settings()
        elif choice == '0':
            # Exit
            print(f"\n{Fore.GREEN}Thank you for using Bangladesh Railway Booking System!")
            break
        else:
            print(f"\n{Fore.RED}Invalid choice. Please try again.")
            time.sleep(1)

if __name__ == "__main__":
    main()
