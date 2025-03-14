import datetime
import time
import subprocess
import os
import sys
import requests
from colorama import Fore, Style, init
import ntplib
from datetime import datetime, timezone, timedelta

# Initialize colorama
init(autoreset=True)

def get_internet_time():
    """Get accurate time from internet NTP servers."""
    # Try multiple NTP servers in case some fail
    ntp_servers = [
        'time.google.com',
        'pool.ntp.org',
        'time.windows.com',
        'time.apple.com'
    ]
    
    for server in ntp_servers:
        try:
            ntp_client = ntplib.NTPClient()
            response = ntp_client.request(server, timeout=2)
            # Convert NTP time to datetime
            internet_time = datetime.fromtimestamp(response.tx_time, timezone.utc)
            # Convert to Bangladesh local time (UTC+6)
            bd_time = internet_time.astimezone(timezone(timedelta(hours=6)))
            print(f"{Fore.GREEN}Successfully synchronized with NTP server: {server}")
            return bd_time
        except Exception as e:
            print(f"{Fore.YELLOW}Failed to connect to NTP server {server}: {e}")
    
    # If all NTP servers fail, fall back to an HTTP time API
    try:
        response = requests.get('http://worldtimeapi.org/api/timezone/Asia/Dhaka', timeout=5)
        if response.status_code == 200:
            time_data = response.json()
            internet_time = datetime.fromisoformat(time_data['datetime'].replace('Z', '+00:00'))
            print(f"{Fore.GREEN}Successfully synchronized with WorldTimeAPI")
            return internet_time
    except Exception as e:
        print(f"{Fore.YELLOW}Failed to connect to WorldTimeAPI: {e}")
    
    # If all internet time sources fail, use system time as fallback
    print(f"{Fore.RED}Failed to get internet time. Using system time instead.")
    return datetime.now()

def clear_screen():
    """Clear terminal screen based on OS."""
    os.system('cls' if os.name == 'nt' else 'clear')

def get_target_time():
    """Get target time from user or environment variable."""
    # Check if time is in environment variable
    env_time = os.environ.get('TARGET_TIME')
    
    if env_time:
        try:
            # Expected format: HH:MM:SS (24-hour)
            time_parts = env_time.split(':')
            hour = int(time_parts[0])
            minute = int(time_parts[1])
            second = int(time_parts[2]) if len(time_parts) > 2 else 0
            
            # Get current time from internet
            now = get_internet_time()
            target = now.replace(hour=hour, minute=minute, second=second, microsecond=0)
            
            # If target time is in the past, use tomorrow
            if target < now:
                target += timedelta(days=1)
                print(f"{Fore.YELLOW}Target time is in the past, scheduling for tomorrow.")
            
            return target
        except (ValueError, IndexError):
            print(f"{Fore.RED}Invalid time format in TARGET_TIME. Using manual input.")
    
    # Manual input
    while True:
        try:
            time_str = input(f"{Fore.CYAN}Enter target time (HH:MM:SS in 24-hour format): ")
            time_parts = time_str.split(':')
            
            hour = int(time_parts[0])
            minute = int(time_parts[1])
            second = int(time_parts[2]) if len(time_parts) > 2 else 0
            
            if hour < 0 or hour > 23 or minute < 0 or minute > 59 or second < 0 or second > 59:
                print(f"{Fore.RED}Invalid time values. Hours (0-23), Minutes and Seconds (0-59)")
                continue
                
            # Get current time from internet
            now = get_internet_time()
            target = now.replace(hour=hour, minute=minute, second=second, microsecond=0)
            
            # If target time is in the past, use tomorrow
            if target < now:
                target += timedelta(days=1)
                print(f"{Fore.YELLOW}Target time is in the past, scheduling for tomorrow.")
            
            return target
        except (ValueError, IndexError):
            print(f"{Fore.RED}Invalid format. Please use HH:MM:SS")

def display_timer(target_time):
    """Display countdown timer until target time and execute on internet time."""
    try:
        # Initial synchronization
        internet_time = get_internet_time()
        
        # Calculate the initial time difference between internet and system time
        system_time = datetime.now(timezone(timedelta(hours=6)))
        time_offset = (internet_time - system_time).total_seconds()
        
        print(f"{Fore.BLUE}Initial time offset: {time_offset:.2f} seconds")
        print(f"{Fore.BLUE}The application will run based on internet time, not system time.")
        
        last_sync_time = time.time()
        
        while True:
            # Current system time (only used for display and calculations)
            current_system_time = time.time()
            system_now = datetime.now(timezone(timedelta(hours=6)))
            
            # Re-sync internet time every minute to ensure accuracy
            if current_system_time - last_sync_time > 60:  # 60 seconds = 1 minute
                internet_time = get_internet_time()
                time_offset = (internet_time - system_now).total_seconds()
                last_sync_time = current_system_time
                print(f"{Fore.BLUE}Time re-synchronized. Current offset: {time_offset:.2f} seconds")
            
            # Calculate current internet time based on the latest offset
            internet_now = system_now + timedelta(seconds=time_offset)
            
            # Make sure target_time is timezone-aware
            if target_time.tzinfo is None:
                target_time = target_time.replace(tzinfo=timezone(timedelta(hours=6)))
                
            # Time remaining based on internet time
            delta = target_time - internet_now
            
            # If we've reached or passed the target time according to internet time, break
            if delta.total_seconds() <= 0:
                clear_screen()
                print(f"{Fore.GREEN}======= INTERNET TIME REACHED TARGET! STARTING APPLICATION =======")
                print(f"{Fore.GREEN}Current internet time: {internet_now.strftime('%H:%M:%S.%f')[:-3]}")
                time.sleep(1)
                break
            
            # Calculate hours, minutes, seconds for display
            total_seconds = int(delta.total_seconds())
            hours, remainder = divmod(total_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            milliseconds = int((delta.total_seconds() - total_seconds) * 1000)
            
            # Create timer display
            clear_screen()
            print(f"{Fore.YELLOW}=====================================")
            print(f"{Fore.CYAN}    RAILWAY BOOKING SCHEDULER")
            print(f"{Fore.YELLOW}=====================================")
            print(f"{Fore.WHITE}Target Time: {target_time.strftime('%H:%M:%S')}")
            print(f"{Fore.WHITE}Internet Time: {internet_now.strftime('%H:%M:%S.%f')[:-3]}")
            print(f"{Fore.YELLOW}=====================================")
            print(f"{Fore.GREEN}Time until execution (based on internet time):")
            
            # Display time components with different colors
            time_display = f"{Fore.CYAN}{hours:02d}{Fore.WHITE}:{Fore.CYAN}{minutes:02d}{Fore.WHITE}:{Fore.CYAN}{seconds:02d}{Fore.WHITE}.{Fore.CYAN}{milliseconds:03d}"
            print(f"{Fore.WHITE}[{time_display}{Fore.WHITE}]")
            
            # Display progress bar
            total_seconds_wait = max(0, delta.total_seconds())
            seconds_elapsed = 86400 - total_seconds_wait  # Max of 24 hours (86400 seconds)
            progress = min(1.0, seconds_elapsed / 86400)
            bar_length = 30
            filled_length = int(bar_length * progress)
            
            bar = Fore.GREEN + '█' * filled_length + Fore.WHITE + '░' * (bar_length - filled_length)
            print(f"{bar}")
            
            print(f"{Fore.YELLOW}=====================================")
            print(f"{Fore.WHITE}Press Ctrl+C to cancel")
            
            # For more precise timing, reduce sleep time as we get closer to target
            if total_seconds > 60:
                time.sleep(0.5)  # Regular interval for long waits
            elif total_seconds > 10:
                time.sleep(0.1)  # More frequent updates as we get closer
            else:
                time.sleep(0.01)  # Very frequent updates in the last 10 seconds
    
    except KeyboardInterrupt:
        print(f"\n{Fore.RED}Operation cancelled by user.")
        sys.exit(0)

def run_application():
    """Run the main application (app.py)."""
    try:
        print(f"{Fore.GREEN}Launching Railway Booking Application...")
        subprocess.run([sys.executable, "app.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"{Fore.RED}Error running application: {e}")
    except KeyboardInterrupt:
        print(f"\n{Fore.RED}Application stopped by user.")
    except Exception as e:
        print(f"{Fore.RED}Unexpected error: {e}")

def main():
    """Main function to schedule and run the application based on internet time."""
    print(f"{Fore.CYAN}=======================================")
    print(f"{Fore.YELLOW}    RAILWAY BOOKING TIME SCHEDULER")
    print(f"{Fore.CYAN}=======================================")
    print(f"{Fore.WHITE}This program will run the Railway booking application (app.py)")
    print(f"{Fore.WHITE}at your specified time using synchronized internet time.")
    print(f"{Fore.CYAN}=======================================\n")
    
    # Initial time synchronization
    print(f"{Fore.BLUE}Synchronizing with internet time servers...")
    current_time = get_internet_time()
    print(f"{Fore.GREEN}Current internet time: {current_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
    
    # Get target time based on internet time
    target_time = get_target_time()
    
    print(f"\n{Fore.GREEN}Application will run at: {target_time.strftime('%H:%M:%S')} (internet time)")
    print(f"{Fore.YELLOW}Starting countdown timer...\n")
    time.sleep(2)
    
    display_timer(target_time)
    run_application()

if __name__ == "__main__":
    main()
