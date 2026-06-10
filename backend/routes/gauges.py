"""Gauge Storage Management API Routes"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from utils.database import get_db, get_ist_now
from utils.dependencies import User, get_current_user

router = APIRouter(prefix="/api/gauges", tags=["gauges"])


# Pydantic Models
class GaugeEntry(BaseModel):
    gauge_type: str  # Thread, Plug
    sub_type: str  # ID, OD
    gauge_details: str
    make: str
    stored_at: str
    image: Optional[str] = None


class GaugeIssueRequest(BaseModel):
    issued_to_id: str
    issued_to_name: str
    remarks: Optional[str] = None
    signature: Optional[str] = None


class GaugeReturnRequest(BaseModel):
    remarks: Optional[str] = None
    signature: Optional[str] = None


@router.post("")
async def create_gauge(
    entry: GaugeEntry,
    current_user: User = Depends(get_current_user)
):
    """Create a new gauge entry"""
    db = get_db()
    now = get_ist_now()
    gauge_id = f"gauge_{uuid.uuid4().hex[:12]}"
    
    gauge_doc = {
        "gauge_id": gauge_id,
        "date": now,
        "gauge_type": entry.gauge_type,
        "sub_type": entry.sub_type,
        "gauge_details": entry.gauge_details,
        "make": entry.make,
        "stored_at": entry.stored_at,
        "image": entry.image,
        "status": "available",
        "issued_to_id": None,
        "issued_to_name": None,
        "issued_date": None,
        "issued_remarks": None,
        "issue_signature": None,
        "created_by": current_user.user_id,
        "created_by_name": current_user.name,
        "created_at": now,
        "updated_at": now
    }
    
    await db.gauges.insert_one(gauge_doc)
    gauge_doc.pop("_id", None)
    return gauge_doc


@router.get("")
async def get_gauges(
    status: Optional[str] = None,
    gauge_type: Optional[str] = None,
    stored_at: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get all gauges with optional filters"""
    db = get_db()
    query = {}
    
    if status:
        query["status"] = status
    if gauge_type:
        query["gauge_type"] = gauge_type
    if stored_at:
        query["stored_at"] = stored_at
    
    gauges = await db.gauges.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    return gauges


@router.post("/{gauge_id}/issue")
async def issue_gauge(
    gauge_id: str,
    request: GaugeIssueRequest,
    current_user: User = Depends(get_current_user)
):
    """Issue a gauge to someone"""
    db = get_db()
    gauge = await db.gauges.find_one({"gauge_id": gauge_id})
    
    if not gauge:
        raise HTTPException(status_code=404, detail="Gauge not found")
    
    if gauge.get("status") == "issued":
        raise HTTPException(status_code=400, detail="Gauge is already issued")
    
    now = get_ist_now()
    
    await db.gauges.update_one(
        {"gauge_id": gauge_id},
        {"$set": {
            "status": "issued",
            "issued_to_id": request.issued_to_id,
            "issued_to_name": request.issued_to_name,
            "issued_date": now,
            "issued_by": current_user.user_id,
            "issued_by_name": current_user.name,
            "issued_remarks": request.remarks,
            "issue_signature": request.signature,
            "updated_at": now
        }}
    )
    
    await db.gauge_transactions.insert_one({
        "gauge_id": gauge_id,
        "gauge_details": gauge.get("gauge_details"),
        "action": "issue",
        "issued_to_id": request.issued_to_id,
        "issued_to_name": request.issued_to_name,
        "issued_by": current_user.user_id,
        "issued_by_name": current_user.name,
        "remarks": request.remarks,
        "signature": request.signature,
        "timestamp": now
    })
    
    return {"message": f"Gauge issued to {request.issued_to_name}"}


@router.post("/{gauge_id}/return")
async def return_gauge(
    gauge_id: str,
    request: GaugeReturnRequest,
    current_user: User = Depends(get_current_user)
):
    """Return an issued gauge"""
    db = get_db()
    gauge = await db.gauges.find_one({"gauge_id": gauge_id})
    
    if not gauge:
        raise HTTPException(status_code=404, detail="Gauge not found")
    
    if gauge.get("status") != "issued":
        raise HTTPException(status_code=400, detail="Gauge is not currently issued")
    
    now = get_ist_now()
    prev_holder = gauge.get("issued_to_name")
    
    await db.gauges.update_one(
        {"gauge_id": gauge_id},
        {"$set": {
            "status": "available",
            "issued_to_id": None,
            "issued_to_name": None,
            "issued_date": None,
            "issued_by": None,
            "issued_by_name": None,
            "issued_remarks": None,
            "issue_signature": None,
            "returned_date": now,
            "returned_by": current_user.user_id,
            "returned_by_name": current_user.name,
            "return_remarks": request.remarks,
            "return_signature": request.signature,
            "updated_at": now
        }}
    )
    
    await db.gauge_transactions.insert_one({
        "gauge_id": gauge_id,
        "gauge_details": gauge.get("gauge_details"),
        "action": "return",
        "returned_from_id": gauge.get("issued_to_id"),
        "returned_from_name": prev_holder,
        "received_by": current_user.user_id,
        "received_by_name": current_user.name,
        "remarks": request.remarks,
        "signature": request.signature,
        "timestamp": now
    })
    
    return {"message": f"Gauge returned from {prev_holder}"}


@router.get("/{gauge_id}/transactions")
async def get_gauge_transactions(
    gauge_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get transaction history for a gauge"""
    db = get_db()
    transactions = await db.gauge_transactions.find(
        {"gauge_id": gauge_id},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(length=100)
    
    return transactions


@router.put("/{gauge_id}")
async def update_gauge(
    gauge_id: str,
    update_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Update gauge details"""
    db = get_db()
    gauge = await db.gauges.find_one({"gauge_id": gauge_id})
    if not gauge:
        raise HTTPException(status_code=404, detail="Gauge not found")
    
    allowed_fields = ["gauge_type", "sub_type", "gauge_details", "make", "stored_at", "image"]
    update_dict = {k: v for k, v in update_data.items() if k in allowed_fields}
    update_dict["updated_at"] = get_ist_now()
    
    await db.gauges.update_one({"gauge_id": gauge_id}, {"$set": update_dict})
    
    updated = await db.gauges.find_one({"gauge_id": gauge_id}, {"_id": 0})
    return updated


@router.delete("/{gauge_id}")
async def delete_gauge(
    gauge_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a gauge entry (Admin only)"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    gauge = await db.gauges.find_one({"gauge_id": gauge_id})
    if not gauge:
        raise HTTPException(status_code=404, detail="Gauge not found")
    
    await db.gauges.delete_one({"gauge_id": gauge_id})
    await db.gauge_transactions.delete_many({"gauge_id": gauge_id})
    return {"message": "Gauge deleted successfully"}
