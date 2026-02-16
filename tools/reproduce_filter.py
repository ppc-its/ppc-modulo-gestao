
from datetime import datetime, timedelta

# Mock Data
# Task spans Jan-Mar
# Jan: 10h, Feb: 20h, Mar: 5h
# Total = 35h
mock_task = {
    "id": 1,
    "title": "Long Task",
    "dateStart": "2026-01-01",
    "dateEnd": "2026-03-31",
    "_apontamentos": [
        {"Data": "15/01/2026", "Horas": 10},
        {"Data": "05/02/2026", "Horas": 10},
        {"Data": "20/02/2026", "Horas": 10},
        {"Data": "10/03/2026", "Horas": 5}
    ]
}

APP_DATA = [mock_task]
TODAY = datetime(2026, 2, 13) # Feb 13, 2026

def parse_date(date_str):
    return datetime.strptime(date_str, "%d/%m/%Y")

def current_logic(period):
    print(f"--- Current Logic ({period}) ---")
    # Current logic filters tasks based on task end date (usually)
    # If period is 'month' (Feb), and task ends in Mar... 
    # The existing code: if (itemDate.getMonth() !== TODAY.getMonth())...
    # If itemDate is EndDate (Mar), it would HIDE the task for Feb filter!
    # If itemDate is StartDate (Jan), it would HIDE it.
    # If itemDate is Today (fallback), it SHOWS it, but with FULL hours (35h).
    
    # Let's say it shows it.
    total_hours = sum(a["Horas"] for a in mock_task["_apontamentos"])
    print(f"Task 1: Displayed Hours = {total_hours} (Expected ~20 for Feb)")

def new_logic(period):
    print(f"--- New Logic ({period}) ---")
    
    # 1. Determine Range for "Month" (Feb 2026)
    start_date = datetime(2026, 2, 1)
    # End date: Mar 1 - 1 sec
    end_date = datetime(2026, 2, 28, 23, 59, 59)
    
    print(f"Range: {start_date} - {end_date}")
    
    # 2. Filter Appointments & Recalculate
    active_appts = []
    for a in mock_task["_apontamentos"]:
        d = parse_date(a["Data"])
        if start_date <= d <= end_date:
            active_appts.append(a)
            
    new_hours = sum(a["Horas"] for a in active_appts)
    print(f"Task 1: Recalculated Hours = {new_hours}")

if __name__ == "__main__":
    current_logic("month")
    new_logic("month")
