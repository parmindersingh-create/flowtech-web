"""Biometric Attendance Module (eSSL Integration) API Routes"""
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import logging
import calendar
import os
from io import BytesIO

from utils.database import get_db, get_ist_now, IST, SHIFT_CONFIG
from utils.dependencies import User, get_current_user, get_optional_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

# eSSL Device Configuration
ESSL_CONFIG = {
    "ip": "192.168.0.201",
    "port": 4370,
    "timeout": 2
}

# Employee Shift Configuration
EMPLOYEE_SHIFT_CONFIG = {
    "day": {"name": "Day Shift (8AM-8PM)", "start": "08:00", "end": "20:00"},
    "night": {"name": "Night Shift (8PM-6AM)", "start": "20:00", "end": "06:00"},
    "general": {"name": "General Shift (9AM-6PM)", "start": "09:00", "end": "18:00"}
}

# Indian Public Holidays
HOLIDAYS = {
    "2025-01-14": "Makar Sankranti", "2025-01-26": "Republic Day",
    "2025-03-14": "Holi", "2025-08-15": "Independence Day",
    "2025-10-02": "Gandhi Jayanti", "2025-11-01": "Diwali",
    "2025-12-25": "Christmas",
    "2026-01-14": "Makar Sankranti", "2026-01-26": "Republic Day",
    "2026-03-03": "Holi", "2026-08-15": "Independence Day",
    "2026-10-02": "Gandhi Jayanti", "2026-10-17": "Diwali",
    "2026-12-25": "Christmas"
}


class AttendanceImport(BaseModel):
    records: List[dict]


class ShiftUpdateRequest(BaseModel):
    biometric_id: str
    shifts: List[str]


class BiometricLinkRequest(BaseModel):
    user_id: str
    biometric_id: str
    name: Optional[str] = None


class ManualAttendanceEntry(BaseModel):
    biometric_id: str
    date: str
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/device-status")
async def get_attendance_device_status(current_user: User = Depends(get_current_user)):
    """Check if eSSL device is reachable"""
    db = get_db()
    
    last_record = await db.attendance_records.find_one(
        {},
        sort=[("synced_at", -1)]
    )
    
    last_sync = None
    if last_record and last_record.get("synced_at"):
        last_sync = last_record["synced_at"]
    
    return {
        "device_ip": ESSL_CONFIG["ip"],
        "device_port": ESSL_CONFIG["port"],
        "status": "configured",
        "last_sync": last_sync.isoformat() if last_sync else None,
        "message": "Device configured for local network sync"
    }


@router.post("/sync")
async def sync_attendance(current_user: User = Depends(get_current_user)):
    """Sync attendance from eSSL device"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        from zk import ZK
        
        zk = ZK(ESSL_CONFIG["ip"], port=ESSL_CONFIG["port"], timeout=ESSL_CONFIG["timeout"])
        conn = zk.connect()
        
        if not conn:
            raise HTTPException(status_code=503, detail="Cannot connect to eSSL device")
        
        attendance = conn.get_attendance()
        users = conn.get_users()
        
        user_map = {u.user_id: u.name for u in users}
        
        synced = 0
        for record in attendance:
            user_id = str(record.user_id)
            timestamp = record.timestamp
            
            date_str = timestamp.strftime("%Y-%m-%d")
            time_str = timestamp.strftime("%H:%M:%S")
            
            existing = await db.attendance_records.find_one({
                "biometric_id": user_id,
                "date": date_str,
                "time": time_str
            })
            
            if not existing:
                await db.attendance_records.insert_one({
                    "biometric_id": user_id,
                    "name": user_map.get(user_id, f"Unknown ({user_id})"),
                    "date": date_str,
                    "time": time_str,
                    "timestamp": timestamp,
                    "synced_at": get_ist_now(),
                    "source": "essl_device"
                })
                synced += 1
        
        conn.disconnect()
        
        return {"success": True, "synced_records": synced, "message": f"Synced {synced} new records"}
        
    except ImportError:
        raise HTTPException(status_code=503, detail="ZK library not available")
    except Exception as e:
        logger.error(f"Attendance sync error: {e}")
        raise HTTPException(status_code=503, detail=f"Sync failed: {str(e)}")


@router.post("/push-sync")
async def push_attendance_sync(request: Request):
    """Receive attendance data pushed from local sync script"""
    db = get_db()
    SYNC_API_KEY = os.getenv("ATTENDANCE_SYNC_KEY", "shopfloor2024sync")
    
    api_key = request.headers.get("X-API-Key")
    if api_key != SYNC_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    try:
        data = await request.json()
        records = data.get("records", [])
        
        if not records:
            return {"success": True, "synced": 0, "message": "No records to sync"}
        
        synced = 0
        for record in records:
            biometric_id = str(record.get("biometric_id", record.get("user_id", "")))
            date_str = record.get("date", "")
            time_str = record.get("time", "")
            name = record.get("name", f"Staff {biometric_id}")
            
            if not biometric_id or not date_str or not time_str:
                continue
            
            existing = await db.attendance_records.find_one({
                "biometric_id": biometric_id,
                "date": date_str,
                "time": time_str
            })
            
            if not existing:
                await db.attendance_records.insert_one({
                    "biometric_id": biometric_id,
                    "name": name,
                    "date": date_str,
                    "time": time_str,
                    "synced_at": get_ist_now(),
                    "source": "push_sync"
                })
                synced += 1
                
                await db.biometric_employees.update_one(
                    {"biometric_id": biometric_id},
                    {"$setOnInsert": {"biometric_id": biometric_id, "name": name}},
                    upsert=True
                )
        
        return {"success": True, "synced": synced, "total_received": len(records)}
        
    except Exception as e:
        logger.error(f"Push sync error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/employees")
async def get_biometric_employees(current_user: User = Depends(get_current_user)):
    """Get all employees from biometric system"""
    db = get_db()
    employees = await db.biometric_employees.find({}, {"_id": 0}).to_list(length=500)
    return employees


@router.delete("/employees/{biometric_id}")
async def delete_biometric_employee(biometric_id: str, current_user: User = Depends(get_current_user)):
    """Delete a biometric employee"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.biometric_employees.delete_one({"biometric_id": biometric_id})
    return {"success": True}


@router.put("/employees/update-shift")
async def update_employee_shift(data: ShiftUpdateRequest, current_user: User = Depends(get_current_user)):
    """Update employee shift assignment"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    link = await db.biometric_user_links.find_one({"biometric_id": data.biometric_id})
    user_id = link.get("user_id") if link else f"bio_{data.biometric_id}"
    
    await db.employee_shifts.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "biometric_id": data.biometric_id,
            "shifts": data.shifts,
            "updated_at": get_ist_now(),
            "updated_by": current_user.user_id
        }},
        upsert=True
    )
    
    return {"success": True}


@router.get("/shift-types")
async def get_shift_types():
    """Get available shift types"""
    return EMPLOYEE_SHIFT_CONFIG


@router.put("/employees/update-name")
async def update_employee_name(request: Request, current_user: User = Depends(get_current_user)):
    """Update employee name in biometric records"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    data = await request.json()
    biometric_id = data.get("biometric_id")
    new_name = data.get("name")
    
    await db.biometric_employees.update_one(
        {"biometric_id": biometric_id},
        {"$set": {"name": new_name}}
    )
    
    await db.attendance_records.update_many(
        {"biometric_id": biometric_id},
        {"$set": {"name": new_name}}
    )
    
    return {"success": True}


@router.post("/link-user-biometric")
async def link_user_biometric(data: BiometricLinkRequest, current_user: User = Depends(get_current_user)):
    """Link app user to biometric ID"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.biometric_user_links.update_one(
        {"user_id": data.user_id},
        {"$set": {
            "user_id": data.user_id,
            "biometric_id": data.biometric_id,
            "name": data.name,
            "linked_at": get_ist_now(),
            "linked_by": current_user.user_id
        }},
        upsert=True
    )
    
    return {"success": True}


@router.delete("/unlink-user-biometric/{user_id}")
async def unlink_user_biometric(user_id: str, current_user: User = Depends(get_current_user)):
    """Unlink app user from biometric ID"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.biometric_user_links.delete_one({"user_id": user_id})
    return {"success": True}


@router.get("/users-biometric-mapping")
async def get_users_biometric_mapping(current_user: User = Depends(get_current_user)):
    """Get all user-biometric mappings"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    mappings = await db.biometric_user_links.find({}, {"_id": 0}).to_list(length=500)
    return mappings


@router.get("/my-attendance")
async def get_my_attendance(
    month: int = None,
    year: int = None,
    current_user: User = Depends(get_current_user)
):
    """Get current user's attendance for the month"""
    db = get_db()
    now = get_ist_now()
    
    if month is None:
        month = now.month
    if year is None:
        year = now.year
    
    link = await db.biometric_user_links.find_one({"user_id": current_user.user_id})
    
    if not link:
        return {"message": "Biometric ID not linked", "attendance": [], "summary": {}}
    
    biometric_id = str(link.get("biometric_id"))
    _, last_day = calendar.monthrange(year, month)
    start_date = f"{year}-{str(month).zfill(2)}-01"
    end_date = f"{year}-{str(month).zfill(2)}-{str(last_day).zfill(2)}"
    
    records = await db.attendance_records.find({
        "biometric_id": biometric_id,
        "date": {"$gte": start_date, "$lte": end_date}
    }).sort([("date", 1), ("time", 1)]).to_list(length=500)
    
    punches_by_date = {}
    for r in records:
        date = r.get("date")
        time = r.get("time")
        if date:
            if date not in punches_by_date:
                punches_by_date[date] = []
            if time:
                punches_by_date[date].append(time)
    
    attendance = []
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    present_days = 0
    
    for day in range(1, last_day + 1):
        date_str = f"{year}-{str(month).zfill(2)}-{str(day).zfill(2)}"
        punches = punches_by_date.get(date_str, [])
        
        from datetime import date as dt_date
        d = dt_date(year, month, day)
        day_name = day_names[d.weekday()]
        is_sunday = d.weekday() == 6
        is_holiday = date_str in HOLIDAYS
        
        punch_in = None
        punch_out = None
        if punches:
            sorted_punches = sorted(punches)
            punch_in = sorted_punches[0]
            if len(sorted_punches) >= 2:
                punch_out = sorted_punches[-1]
        
        is_present = punch_in is not None
        if is_present:
            present_days += 1
        
        attendance.append({
            "date": date_str,
            "day_name": day_name,
            "punch_in": punch_in,
            "punch_out": punch_out,
            "is_present": is_present,
            "is_sunday": is_sunday,
            "is_holiday": is_holiday,
            "holiday_name": HOLIDAYS.get(date_str)
        })
    
    return {
        "attendance": attendance,
        "summary": {
            "total_days": last_day,
            "present_days": present_days,
            "absent_days": last_day - present_days
        }
    }


@router.post("/import-data")
async def import_attendance_data(data: AttendanceImport, current_user: User = Depends(get_current_user)):
    """Import attendance data from external source"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    imported = 0
    for record in data.records:
        biometric_id = str(record.get("biometric_id", ""))
        date_str = record.get("date", "")
        time_str = record.get("time", "")
        
        if biometric_id and date_str and time_str:
            existing = await db.attendance_records.find_one({
                "biometric_id": biometric_id,
                "date": date_str,
                "time": time_str
            })
            
            if not existing:
                await db.attendance_records.insert_one({
                    "biometric_id": biometric_id,
                    "name": record.get("name", f"Staff {biometric_id}"),
                    "date": date_str,
                    "time": time_str,
                    "synced_at": get_ist_now(),
                    "source": "import"
                })
                imported += 1
    
    return {"success": True, "imported": imported}


@router.delete("/employees-clear-all")
async def clear_all_employees(current_user: User = Depends(get_current_user)):
    """Clear all biometric employees (Admin only)"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.biometric_employees.delete_many({})
    return {"success": True}


@router.delete("/records-clear-all")
async def clear_all_records(current_user: User = Depends(get_current_user)):
    """Clear all attendance records (Admin only)"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.attendance_records.delete_many({})
    return {"success": True}


@router.post("/manual-entry")
async def add_manual_attendance(entry: ManualAttendanceEntry, current_user: User = Depends(get_current_user)):
    """Add manual attendance entry (Admin only)"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    emp = await db.biometric_employees.find_one({"biometric_id": entry.biometric_id})
    name = emp.get("name", f"Staff {entry.biometric_id}") if emp else f"Staff {entry.biometric_id}"
    
    records_added = 0
    
    if entry.punch_in:
        await db.attendance_records.insert_one({
            "biometric_id": entry.biometric_id,
            "name": name,
            "date": entry.date,
            "time": entry.punch_in,
            "synced_at": get_ist_now(),
            "source": "manual",
            "added_by": current_user.user_id,
            "remarks": entry.remarks
        })
        records_added += 1
    
    if entry.punch_out:
        await db.attendance_records.insert_one({
            "biometric_id": entry.biometric_id,
            "name": name,
            "date": entry.date,
            "time": entry.punch_out,
            "synced_at": get_ist_now(),
            "source": "manual",
            "added_by": current_user.user_id,
            "remarks": entry.remarks
        })
        records_added += 1
    
    return {"success": True, "records_added": records_added}


@router.get("/config")
async def get_attendance_config(current_user: User = Depends(get_current_user)):
    """Get attendance configuration"""
    return {
        "shift_config": SHIFT_CONFIG,
        "employee_shift_config": EMPLOYEE_SHIFT_CONFIG,
        "holidays": HOLIDAYS
    }
