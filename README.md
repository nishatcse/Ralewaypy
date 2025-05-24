# Bangladesh Railway Ticket Booking Automation

An automated solution for booking Bangladesh Railway tickets through the official Railway App API with precise timing and configuration management.

## Overview

This project provides tools to automate the reservation of train tickets from the official Bangladesh Railway platform (https://railapp.railway.gov.bd/). It's designed to help you book tickets exactly when they become available, using internet time synchronization for pinpoint accuracy.

The system can be primarily interacted with via a **Web Frontend (Next.js based GUI)** or through **Command-Line Interface (CLI)** Python scripts.

## Features

- **Automated Booking**: Reserve seats automatically when they become available
- **Internet Time Synchronization**: Ensures the booking request is sent at the exact moment tickets are released
- **Configurable Seat Preferences**: Specify your desired seat numbers and class type
- **Easy Configuration**: Simple command-line tools to update booking parameters
- **Multiple Passenger Support**: Book up to 4 tickets at once

## Components

The project consists of three main Python scripts:

1. **app.py**: The core script that handles the ticket booking process
2. **scheduler.py**: Time synchronization tool that runs the booking app at a precise moment
3. **config_updater.py**: Tool to easily modify all booking parameters and credentials

## Requirements

- Python 3.8+
- Internet connection
- Bangladesh Railway account credentials (from https://railapp.railway.gov.bd/)

## Installation

1. Clone or download this repository
2. Install the required dependencies:

```bash
pip install requests ntplib colorama python-dotenv
```

## Configuration

The application uses a `.env` file to store your credentials and booking preferences. You can edit this file directly or use the `config_updater.py` tool:

```bash
python config_updater.py
```

### Configuration Parameters

- **Credentials**:
  - `MOBILE_NUMBER`: Your Bangladesh Railway account mobile number
  - `PASSWORD`: Your Bangladesh Railway account password

- **Travel Details**:
  - `FROM_CITY`: Departure station (e.g., Dhaka)
  - `TO_CITY`: Destination station (e.g., Dinajpur)
  - `DATE_OF_JOURNEY`: Travel date in format dd-MMM-yyyy (e.g., 20-Mar-2025)
  - `SEAT_CLASS`: Available options: SHOVAN, S_CHAIR, AC_S, AC_B, SNIGDHA
  - `TRAIN_NUMBER`: Train number (e.g., 791)
  - `MAX_SELECTABLE_SEAT`: Number of tickets to book (1-4)
  - `DESIRED_SEATS`: Comma-separated list of preferred seats (e.g., JHA-23,JHA-24)

- **Scheduler Settings**:
  - `TARGET_TIME`: Default time for scheduled bookings in HH:MM:SS format (e.g., 08:00:00)

## Usage

### Setting Up Your Configuration

Before running any of the scripts, make sure your `.env` file is properly configured:

1. Run the configuration tool:
   ```bash
   python config_updater.py
   ```

2. Enter your credentials and booking details when prompted
   - For mobile number, use the format 01XXXXXXXXX (11 digits)
   - Choose a station name exactly as it appears in the Bangladesh Railway system
   - Date format should be dd-MMM-yyyy (e.g., 20-Mar-2025)
   - For seat class, use one of: SHOVAN, S_CHAIR, AC_S, AC_B, SNIGDHA

3. You can also directly edit the `.env` file if you prefer, but the config tool provides validation and formatting guidance

### Regular Booking

To immediately start the booking process:

```bash
python app.py
```

The app will:
1. Authenticate with your Bangladesh Railway account
2. Search for trains matching your criteria
3. Check seat availability
4. Select and book seats based on your preferences
5. Proceed to the payment process
6. Provide booking confirmation details

You'll see real-time progress in the terminal with color-coded status messages.

### Scheduled Booking

For time-sensitive bookings (like when tickets are released at specific times):

1. Run the scheduler:
   ```bash
   python scheduler.py
   ```

2. The scheduler will prompt you for the target time:
   - It displays the default time from your `.env` file (TARGET_TIME)
   - Simply press Enter to use the default time
   - Or enter a custom time in 24-hour format (HH:MM:SS) to override the default

3. The scheduler will:
   - Synchronize with internet time servers for accuracy
   - Calculate the time remaining until your target time
   - Display a countdown timer
   - Launch the booking application at the precise moment
   - Show detailed time synchronization information

4. Keep the terminal window open and ensure your computer doesn't go to sleep

Example scheduler output:
```
Internet time synchronized: 09:55:23
Default target time from config: 08:00:00
Enter target time (HH:MM:SS) or press Enter to use default: 
Using default time: 08:00:00
Target time: 08:00:00
Time remaining: 00:04:37
Countdown: 00:00:05... 00:00:04... 00:00:03... 00:00:02... 00:00:01...
Launching booking application NOW!
```

## Web Frontend (Next.js)

The Next.js web application provides a user-friendly graphical interface to manage configurations and run the Python booking scripts.

### Overview (Frontend)

The web frontend allows you to:
- View and update all configuration parameters stored in the root `.env` file.
- Trigger the `app.py` script for immediate booking, with support for interactive input (OTP, passenger names) directly in the UI.
- Trigger the `scheduler.py` script with a specified target time.
- Trigger the `test_auth.py` script to verify credentials.
- View real-time output from the executed scripts.

### Prerequisites for Frontend

- **Node.js**: Version 18+ recommended.
- **npm** or **yarn**: npm is typically included with Node.js.

### Frontend Setup

1.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
    (or `yarn install` if you prefer yarn)

### Running the Frontend Development Server

1.  Ensure you are in the `frontend` directory.
2.  Start the development server:
    ```bash
    npm run dev
    ```
    (or `yarn dev`)
3.  The application will usually be available at `http://localhost:3000`.

### Using the Web Interface

The web interface is divided into several sections:

-   **Current Configuration:** Displays the current settings loaded from the `.env` file.
-   **Actions:**
    -   **Update Configuration:** Allows you to modify any of the `.env` settings (e.g., mobile number, password, travel details, desired seats). Click "Update Settings" to save changes to the `.env` file.
    -   **Book Tickets Now (`app.py`):**
        -   Runs the main booking script `app.py`.
        -   **Interactive Prompts:** When `app.py` requires input (like OTP or additional passenger names), a prompt will appear in this section of the UI. Enter the required information and click "Submit Input".
        -   Script output is streamed in real-time.
        -   **Payment Limitation:** Please note that the final payment step (selecting bKash, Nagad, etc.) in `app.py` is **not yet handled interactively by this web UI**. If the script reaches this stage, it will wait for input in the terminal where the Next.js *backend* is running (or might appear to hang in the UI if the backend isn't actively monitored for such `input()` calls from the Python script).
    -   **Schedule Booking (`scheduler.py`):**
        -   Allows you to run the `scheduler.py` script.
        -   You must provide a target time in HH:MM:SS format (e.g., `08:00:00`). This will override the `TARGET_TIME` in your `.env` for this specific run.
        -   Script output is streamed. This script is not interactive beyond the initial time argument.
    -   **Test Authentication (`test_auth.py`):**
        -   Runs the `test_auth.py` script to verify your login credentials.
        -   Script output is streamed. This script is not interactive.

### Backend Dependency

The Next.js frontend is an interface for the Python scripts located in the project root. For the frontend to function correctly:
-   The Python environment must be set up as described in the "Requirements" and "Installation" sections for the CLI tools (Python 3.8+, `pip install requests ntplib colorama python-dotenv`).
-   The root `.env` file must exist and be configured (either manually or via the "Update Configuration" section of the web UI).
-   The Python scripts (`app.py`, `scheduler.py`, `test_auth.py`) are executed by the Next.js backend. Ensure they are present and executable.

### Seat Selection Strategy

The application uses a prioritized approach for seat selection:

1. If you specified `DESIRED_SEATS` in the configuration, it will attempt to book exactly those seats
2. If your desired seats are unavailable or not specified, it will:
   - Try to find adjacent seats together (for multiple tickets)
   - Prefer window seats when possible
   - Select seats with the best availability in your chosen class

### Managing Multiple Bookings

You can set up multiple configuration profiles:

1. Create backup copies of your `.env` file with different names (e.g., `.env.trip1`, `.env.trip2`)
2. When you need to switch configurations:
   ```bash
   copy .env.trip1 .env
   ```
3. Then run the application as normal

### Testing Your Configuration

To verify your login credentials and connection to the Bangladesh Railway API:

```bash
python test_auth.py
```

This will attempt to authenticate with your credentials and report if the connection was successful.

## How It Works

1. The application logs into your Bangladesh Railway account
2. It checks seat availability for your chosen route and date
3. When seats become available, it selects the best seats (either your preferred seats or the best available)
4. It completes the booking process, provides payment information, and generates a booking confirmation

## Troubleshooting

- **Case Sensitivity Issues**: If you encounter errors related to "redirecturl", ensure the latest version is being used which fixes case sensitivity issues
- **Seat Selection Problems**: If seat selection fails, try specifying explicit desired seats or reduce the number of tickets
- **Time Synchronization**: For the most accurate timing, ensure your Internet connection is stable when using the scheduler
- **Authentication Issues**: Verify your credentials match those used on the official Bangladesh Railway app (https://railapp.railway.gov.bd/)

## License

This project is for personal use only.

## Disclaimer

This tool is intended for personal use to facilitate ticket booking. Please use responsibly and in accordance with Bangladesh Railway's terms of service. The web frontend aims to simplify the usage of the underlying Python scripts.