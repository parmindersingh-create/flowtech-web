"""Database connection and shared utilities"""
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import os
from dotenv import load_dotenv

load_dotenv()

# IST Timezone
IST = ZoneInfo("Asia/Kolkata")

# Database connection - shared with server.py
# This will be set by server.py after initialization
_db = None

def set_db(database):
    """Set the database instance (called from server.py)"""
    global _db
    _db = database

def get_db():
    """Get database instance"""
    global _db
    return _db

# Time utilities
def get_ist_now():
    """Get current datetime in IST timezone"""
    return datetime.now(IST)

def to_ist(dt):
    """Convert a datetime to IST timezone"""
    if dt is None:
        return None
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)

def format_ist_datetime(dt):
    """Format datetime as IST string"""
    ist_dt = to_ist(dt)
    if ist_dt is None:
        return None
    return ist_dt.strftime('%d/%m/%Y %I:%M %p')

# Shift Management Functions
def get_current_shift():
    """Get current shift based on IST time"""
    now = get_ist_now()
    hour = now.hour
    
    # Morning shift: 8 AM to 8 PM (8:00 - 19:59)
    # Night shift: 8 PM to 6 AM (20:00 - 05:59)
    if 8 <= hour < 20:
        return "morning"
    else:
        return "night"

def get_shift_end_time():
    """Get the end time of current shift in IST"""
    now = get_ist_now()
    hour = now.hour
    
    if 8 <= hour < 20:
        # Morning shift ends at 8 PM today
        shift_end = now.replace(hour=20, minute=0, second=0, microsecond=0)
    else:
        # Night shift ends at 6 AM next day
        if hour >= 20:
            # After 8 PM, shift ends at 6 AM next day
            shift_end = (now + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
        else:
            # Before 6 AM, shift ends at 6 AM today
            shift_end = now.replace(hour=6, minute=0, second=0, microsecond=0)
    
    return shift_end

def get_shift_for_time(dt):
    """Get shift config dict for a given datetime"""
    if dt is None:
        return {"name": "Unknown", "start": "08:00", "end": "20:00", "late_grace_minutes": 15}
    try:
        ist_dt = to_ist(dt)
        hour = ist_dt.hour
    except:
        hour = 12
    if 5 <= hour < 17:
        return {"name": "Day Shift", "start": "08:00", "end": "20:00", "late_grace_minutes": 15}
    return {"name": "Night Shift", "start": "20:00", "end": "06:00", "late_grace_minutes": 15}


# Shift Configuration
SHIFT_CONFIG = {
    "day": {
        "name": "Day Shift",
        "start": "08:00",
        "end": "20:00",
        "late_grace_minutes": 15
    },
    "night": {
        "name": "Night Shift", 
        "start": "20:00",
        "end": "06:00",
        "late_grace_minutes": 15
    }
}

# Leave Configuration
LEAVE_CONFIG = {
    "pl_per_month": 2,  # Paid leaves credited monthly
    "pl_year_start_month": 1,  # January
    "late_early_grace_count": 3,  # Grace instances per month
    "late_early_grace_max_hours": 2,  # Max hours for grace (up to 2 hrs)
    "buffer_minutes": 10,  # Buffer from shift timing
}

