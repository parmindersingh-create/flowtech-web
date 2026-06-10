"""Leave Management & Attendance Alerts API Routes"""
from fastapi import APIRouter, HTTPException, Request, Depends
from datetime import datetime
from typing import Optional
import logging
import calendar

from utils.database import get_db, get_ist_now, LEAVE_CONFIG, SHIFT_CONFIG
from utils.dependencies import User, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["leave"])


class LeaveRequestType(str):
    LEAVE = "leave"
    LATE_COMING = "late_coming"
    EARLY_GOING = "early_going"
    ENCASH = "encash"


@router.get("/leave/config")
async def get_leave_config(current_user: User = Depends(get_current_user)):
    """Get leave configuration"""
    return LEAVE_CONFIG


@router.get("/leave/balance/{user_id}")
async def get_leave_balance(user_id: str, current_user: User = Depends(get_current_user)):
    """Get PL balance for a user (yearly Jan-Dec)"""
    db = get_db()
    year = get_ist_now().year
    
    balance = await db.leave_balances.find_one({"user_id": user_id, "year": year})
    
    if not balance:
        current_month = get_ist_now().month
        total_pl = current_month * LEAVE_CONFIG["pl_per_month"]
        
        balance = {
            "user_id": user_id,
            "year": year,
            "total_pl": total_pl,
            "used_pl": 0,
            "encashed_pl": 0,
            "created_at": get_ist_now()
        }
        await db.leave_balances.insert_one(balance)
    
    available_pl = balance["total_pl"] - balance["used_pl"] - balance.get("encashed_pl", 0)
    
    return {
        "user_id": user_id,
        "year": year,
        "total_pl": balance["total_pl"],
        "used_pl": balance["used_pl"],
        "encashed_pl": balance.get("encashed_pl", 0),
        "available_pl": max(0, available_pl),
        "pl_per_month": LEAVE_CONFIG["pl_per_month"]
    }


@router.get("/leave/balance-all")
async def get_all_leave_balances(current_user: User = Depends(get_current_user)):
    """Admin: Get PL balances for all staff"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    year = get_ist_now().year
    current_month = get_ist_now().month
    
    biometric_staff = await db.attendance_records.aggregate([
        {"$match": {"biometric_id": {"$exists": True, "$ne": None, "$ne": ""}}},
        {"$group": {
            "_id": "$biometric_id",
            "name": {"$first": "$name"},
        }},
    ]).to_list(length=500)
    
    biometric_links = await db.biometric_user_links.find({}).to_list(length=500)
    link_map = {str(l.get("biometric_id")): l for l in biometric_links}
    
    biometric_employees = await db.biometric_employees.find({}).to_list(length=500)
    emp_map = {str(e.get("biometric_id") or e.get("_id")): e for e in biometric_employees}
    
    balances = []
    seen_bio_ids = set()
    
    for bio in biometric_staff:
        bio_id = str(bio.get("_id", ""))
        if not bio_id or bio_id in seen_bio_ids:
            continue
        seen_bio_ids.add(bio_id)
        
        link = link_map.get(bio_id, {})
        emp = emp_map.get(bio_id, {})
        name = link.get("name") or emp.get("name") or bio.get("name") or f"Staff {bio_id}"
        user_id = link.get("user_id") or f"bio_{bio_id}"
        
        balance = await db.leave_balances.find_one({"user_id": user_id, "year": year})
        
        if not balance:
            total_pl = current_month * LEAVE_CONFIG["pl_per_month"]
            balance = {
                "total_pl": total_pl,
                "used_pl": 0,
                "encashed_pl": 0
            }
        
        available_pl = balance["total_pl"] - balance["used_pl"] - balance.get("encashed_pl", 0)
        
        balances.append({
            "user_id": user_id,
            "name": name,
            "biometric_id": bio_id,
            "year": year,
            "total_pl": balance["total_pl"],
            "used_pl": balance["used_pl"],
            "encashed_pl": balance.get("encashed_pl", 0),
            "available_pl": max(0, available_pl)
        })
    
    balances.sort(key=lambda x: (x.get("name") or "").lower())
    return balances


@router.post("/leave/reset-pl")
async def reset_leave_balance(request: Request, current_user: User = Depends(get_current_user)):
    """Admin: Reset PL balance for a user"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    data = await request.json()
    user_id = data.get("user_id")
    year = data.get("year", get_ist_now().year)
    reset_type = data.get("reset_type", "full")
    
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    
    current_month = get_ist_now().month
    total_pl = current_month * LEAVE_CONFIG["pl_per_month"]
    
    update_data = {"updated_at": get_ist_now(), "updated_by": current_user.user_id}
    
    if reset_type == "full":
        update_data["total_pl"] = total_pl
        update_data["used_pl"] = 0
        update_data["encashed_pl"] = 0
    elif reset_type == "used_only":
        update_data["used_pl"] = 0
    elif reset_type == "encashed_only":
        update_data["encashed_pl"] = 0
    
    await db.leave_balances.update_one(
        {"user_id": user_id, "year": year},
        {"$set": update_data},
        upsert=True
    )
    
    await db.leave_audit_log.insert_one({
        "action": "reset_pl",
        "user_id": user_id,
        "year": year,
        "reset_type": reset_type,
        "performed_by": current_user.user_id,
        "performed_at": get_ist_now()
    })
    
    return {"success": True, "message": f"PL balance reset for {user_id}"}


@router.post("/leave/request")
async def submit_leave_request(request: Request, current_user: User = Depends(get_current_user)):
    """Submit a leave/late/early request"""
    db = get_db()
    data = await request.json()
    
    request_type = data.get("type")
    date = data.get("date")
    reason = data.get("reason", "")
    expected_time = data.get("expected_time")
    pl_days = data.get("pl_days", 1)
    
    if request_type not in ["leave", "late_coming", "early_going", "encash"]:
        raise HTTPException(status_code=400, detail="Invalid request type")
    
    if request_type != "encash" and not date:
        raise HTTPException(status_code=400, detail="Date is required")
    
    if request_type == "encash":
        year = get_ist_now().year
        balance = await db.leave_balances.find_one({"user_id": current_user.user_id, "year": year})
        if not balance:
            raise HTTPException(status_code=400, detail="No leave balance found")
        
        available = balance["total_pl"] - balance["used_pl"] - balance.get("encashed_pl", 0)
        if pl_days > available:
            raise HTTPException(status_code=400, detail=f"Insufficient PL balance. Available: {available}")
    
    leave_request = {
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "type": request_type,
        "date": date,
        "reason": reason,
        "expected_time": expected_time,
        "pl_days": pl_days if request_type == "encash" else None,
        "status": "pending",
        "created_at": get_ist_now()
    }
    
    result = await db.leave_requests.insert_one(leave_request)
    return {"success": True, "request_id": str(result.inserted_id)}


@router.get("/leave/requests")
async def get_leave_requests(
    status: str = None,
    user_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Get leave requests - Admin sees all, Operator sees own"""
    db = get_db()
    query = {}
    
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        query["user_id"] = current_user.user_id
    elif user_id:
        query["user_id"] = user_id
    
    if status:
        query["status"] = status
    
    requests = await db.leave_requests.find(query).sort("created_at", -1).to_list(length=200)
    
    for req in requests:
        req["_id"] = str(req["_id"])
    
    return requests


@router.post("/leave/approve")
async def approve_leave_request(request: Request, current_user: User = Depends(get_current_user)):
    """Admin: Approve or reject a leave request"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    data = await request.json()
    request_id = data.get("request_id")
    action = data.get("action")
    remarks = data.get("remarks", "")
    
    if not request_id or action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="request_id and valid action required")
    
    from bson import ObjectId
    leave_req = await db.leave_requests.find_one({"_id": ObjectId(request_id)})
    
    if not leave_req:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if leave_req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request already processed")
    
    new_status = "approved" if action == "approve" else "rejected"
    
    await db.leave_requests.update_one(
        {"_id": ObjectId(request_id)},
        {"$set": {
            "status": new_status,
            "approved_by": current_user.user_id,
            "approved_by_name": current_user.name,
            "approved_at": get_ist_now(),
            "remarks": remarks
        }}
    )
    
    if action == "approve":
        year = get_ist_now().year
        user_id = leave_req["user_id"]
        
        if leave_req["type"] == "leave":
            await db.leave_balances.update_one(
                {"user_id": user_id, "year": year},
                {"$inc": {"used_pl": 1}},
                upsert=True
            )
        elif leave_req["type"] == "encash":
            pl_days = leave_req.get("pl_days", 1)
            await db.leave_balances.update_one(
                {"user_id": user_id, "year": year},
                {"$inc": {"encashed_pl": pl_days}},
                upsert=True
            )
    
    return {"success": True, "status": new_status}


@router.get("/leave/my-requests")
async def get_my_leave_requests(current_user: User = Depends(get_current_user)):
    """Get current user's leave requests"""
    db = get_db()
    requests = await db.leave_requests.find(
        {"user_id": current_user.user_id}
    ).sort("created_at", -1).to_list(length=100)
    
    for req in requests:
        req["_id"] = str(req["_id"])
    
    return requests


@router.get("/leave/my-balance")
async def get_my_leave_balance(current_user: User = Depends(get_current_user)):
    """Get current user's PL balance"""
    return await get_leave_balance(current_user.user_id, current_user)


# ==================== ATTENDANCE ALERTS ====================

@router.get("/attendance/alerts")
async def get_attendance_alerts(
    month: int = None,
    year: int = None,
    current_user: User = Depends(get_current_user)
):
    """Admin: Get late coming / early going alerts for the month"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    now = get_ist_now()
    if month is None:
        month = now.month
    if year is None:
        year = now.year
    
    _, last_day = calendar.monthrange(year, month)
    start_date = f"{year}-{str(month).zfill(2)}-01"
    end_date = f"{year}-{str(month).zfill(2)}-{str(last_day).zfill(2)}"
    
    alerts = await db.attendance_alerts.find({
        "date": {"$gte": start_date, "$lte": end_date}
    }).sort([("date", -1), ("created_at", -1)]).to_list(length=500)
    
    for alert in alerts:
        alert["_id"] = str(alert["_id"])
    
    return alerts


@router.get("/attendance/alerts-summary")
async def get_attendance_alerts_summary(
    month: int = None,
    year: int = None,
    current_user: User = Depends(get_current_user)
):
    """Admin: Get summary of late/early alerts per user"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    now = get_ist_now()
    if month is None:
        month = now.month
    if year is None:
        year = now.year
    
    _, last_day = calendar.monthrange(year, month)
    start_date = f"{year}-{str(month).zfill(2)}-01"
    end_date = f"{year}-{str(month).zfill(2)}-{str(last_day).zfill(2)}"
    
    pipeline = [
        {"$match": {"date": {"$gte": start_date, "$lte": end_date}}},
        {"$group": {
            "_id": "$user_id",
            "user_name": {"$first": "$user_name"},
            "late_count": {"$sum": {"$cond": [{"$eq": ["$type", "late"]}, 1, 0]}},
            "early_count": {"$sum": {"$cond": [{"$eq": ["$type", "early"]}, 1, 0]}},
            "total_late_minutes": {"$sum": {"$cond": [{"$eq": ["$type", "late"]}, "$duration_minutes", 0]}},
            "total_early_minutes": {"$sum": {"$cond": [{"$eq": ["$type", "early"]}, "$duration_minutes", 0]}},
            "grace_used": {"$sum": {"$cond": ["$is_grace", 1, 0]}},
            "deduction_count": {"$sum": {"$cond": ["$is_deducted", 1, 0]}}
        }},
        {"$sort": {"deduction_count": -1}}
    ]
    
    summaries = await db.attendance_alerts.aggregate(pipeline).to_list(length=200)
    return summaries


@router.post("/attendance/process-alerts")
async def process_attendance_alerts(request: Request, current_user: User = Depends(get_current_user)):
    """Admin: Process attendance records and generate late/early alerts for a month"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    data = await request.json()
    month = data.get("month", get_ist_now().month)
    year = data.get("year", get_ist_now().year)
    
    _, last_day = calendar.monthrange(year, month)
    start_date = f"{year}-{str(month).zfill(2)}-01"
    end_date = f"{year}-{str(month).zfill(2)}-{str(last_day).zfill(2)}"
    
    biometric_staff = await db.attendance_records.aggregate([
        {"$match": {
            "biometric_id": {"$exists": True, "$ne": None, "$ne": ""},
            "date": {"$gte": start_date, "$lte": end_date}
        }},
        {"$group": {
            "_id": "$biometric_id",
            "name": {"$first": "$name"},
        }},
    ]).to_list(length=500)
    
    biometric_links = await db.biometric_user_links.find({}).to_list(length=500)
    link_map = {str(l.get("biometric_id")): l for l in biometric_links}
    
    biometric_employees = await db.biometric_employees.find({}).to_list(length=500)
    emp_map = {str(e.get("biometric_id") or e.get("_id")): e for e in biometric_employees}
    
    buffer_minutes = LEAVE_CONFIG["buffer_minutes"]
    grace_count = LEAVE_CONFIG["late_early_grace_count"]
    grace_max_hours = LEAVE_CONFIG["late_early_grace_max_hours"]
    
    alerts_created = 0
    
    for bio in biometric_staff:
        bio_id = str(bio.get("_id", ""))
        if not bio_id:
            continue
            
        link = link_map.get(bio_id, {})
        emp = emp_map.get(bio_id, {})
        user_id = link.get("user_id") or f"bio_{bio_id}"
        user_name = link.get("name") or emp.get("name") or bio.get("name") or f"Staff {bio_id}"
        
        shift_assignment = await db.employee_shifts.find_one({"user_id": user_id})
        shift_id = shift_assignment.get("shifts", ["day"])[0] if shift_assignment else "day"
        shift = SHIFT_CONFIG.get(shift_id, SHIFT_CONFIG["day"])
        
        shift_start_str = shift["start"]
        shift_end_str = shift["end"]
        shift_start_hour, shift_start_min = map(int, shift_start_str.split(":"))
        shift_end_hour, shift_end_min = map(int, shift_end_str.split(":"))
        
        records = await db.attendance_records.find({
            "biometric_id": bio_id,
            "date": {"$gte": start_date, "$lte": end_date}
        }).to_list(length=500)
        
        punches_by_date = {}
        for r in records:
            date = r.get("date")
            time_str = r.get("time") or ""
            if date and time_str:
                if date not in punches_by_date:
                    punches_by_date[date] = []
                punches_by_date[date].append(time_str)
        
        existing_alerts = await db.attendance_alerts.find({
            "user_id": user_id,
            "date": {"$gte": start_date, "$lte": end_date}
        }).to_list(length=100)
        
        grace_used = sum(1 for a in existing_alerts if a.get("is_grace"))
        
        for date, times in punches_by_date.items():
            sorted_times = sorted(times)
            first_punch = sorted_times[0]
            last_punch = sorted_times[-1] if len(sorted_times) >= 2 else None
            
            try:
                first_hour, first_min = map(int, first_punch.split(":")[:2])
                
                expected_in = shift_start_hour * 60 + shift_start_min + buffer_minutes
                actual_in = first_hour * 60 + first_min
                
                if actual_in > expected_in:
                    late_minutes = actual_in - (shift_start_hour * 60 + shift_start_min)
                    
                    existing = await db.attendance_alerts.find_one({
                        "user_id": user_id,
                        "date": date,
                        "type": "late"
                    })
                    
                    if not existing:
                        is_grace = grace_used < grace_count and late_minutes <= grace_max_hours * 60
                        
                        alert = {
                            "user_id": user_id,
                            "user_name": user_name,
                            "biometric_id": bio_id,
                            "date": date,
                            "type": "late",
                            "expected_time": shift_start_str,
                            "actual_time": first_punch,
                            "duration_minutes": late_minutes,
                            "is_grace": is_grace,
                            "is_deducted": not is_grace,
                            "created_at": get_ist_now()
                        }
                        await db.attendance_alerts.insert_one(alert)
                        alerts_created += 1
                        
                        if is_grace:
                            grace_used += 1
                
                if last_punch:
                    last_hour, last_min = map(int, last_punch.split(":")[:2])
                    
                    if shift_end_hour < shift_start_hour:
                        expected_out = (shift_end_hour + 24) * 60 + shift_end_min - buffer_minutes
                        actual_out = last_hour * 60 + last_min
                        if last_hour < 12:
                            actual_out += 24 * 60
                    else:
                        expected_out = shift_end_hour * 60 + shift_end_min - buffer_minutes
                        actual_out = last_hour * 60 + last_min
                    
                    if actual_out < expected_out:
                        early_minutes = (shift_end_hour * 60 + shift_end_min) - (last_hour * 60 + last_min)
                        if early_minutes < 0:
                            early_minutes += 24 * 60
                        
                        existing = await db.attendance_alerts.find_one({
                            "user_id": user_id,
                            "date": date,
                            "type": "early"
                        })
                        
                        if not existing:
                            is_grace = grace_used < grace_count and early_minutes <= grace_max_hours * 60
                            
                            alert = {
                                "user_id": user_id,
                                "user_name": user_name,
                                "biometric_id": bio_id,
                                "date": date,
                                "type": "early",
                                "expected_time": shift_end_str,
                                "actual_time": last_punch,
                                "duration_minutes": early_minutes,
                                "is_grace": is_grace,
                                "is_deducted": not is_grace,
                                "created_at": get_ist_now()
                            }
                            await db.attendance_alerts.insert_one(alert)
                            alerts_created += 1
                            
                            if is_grace:
                                grace_used += 1
                
            except Exception as e:
                logger.error(f"Error processing alerts for {user_id} on {date}: {e}")
                continue
    
    return {"success": True, "alerts_created": alerts_created}


@router.get("/attendance/my-alerts")
async def get_my_attendance_alerts(
    month: int = None,
    year: int = None,
    current_user: User = Depends(get_current_user)
):
    """Get current user's late/early alerts"""
    db = get_db()
    now = get_ist_now()
    if month is None:
        month = now.month
    if year is None:
        year = now.year
    
    _, last_day = calendar.monthrange(year, month)
    start_date = f"{year}-{str(month).zfill(2)}-01"
    end_date = f"{year}-{str(month).zfill(2)}-{str(last_day).zfill(2)}"
    
    alerts = await db.attendance_alerts.find({
        "user_id": current_user.user_id,
        "date": {"$gte": start_date, "$lte": end_date}
    }).sort("date", -1).to_list(length=100)
    
    grace_used = sum(1 for a in alerts if a.get("is_grace"))
    deduction_count = sum(1 for a in alerts if a.get("is_deducted"))
    
    for alert in alerts:
        alert["_id"] = str(alert["_id"])
    
    return {
        "alerts": alerts,
        "grace_limit": LEAVE_CONFIG["late_early_grace_count"],
        "grace_used": grace_used,
        "grace_remaining": max(0, LEAVE_CONFIG["late_early_grace_count"] - grace_used),
        "deduction_count": deduction_count
    }
