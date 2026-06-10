"""Machine Management API Routes"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
import logging

from utils.database import get_db, get_ist_now
from utils.dependencies import User, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["machines"])


class MachineCreate(BaseModel):
    name: str
    machine_id: Optional[str] = None
    category: str = "VMC"
    location: Optional[str] = None
    description: Optional[str] = None


@router.get("/machines")
async def get_machines(current_user: User = Depends(get_current_user)):
    """Get all machines"""
    db = get_db()
    machines = await db.machines.find({}, {"_id": 0}).sort("name", 1).to_list(length=100)
    return machines


@router.post("/machines")
async def create_machine(machine: MachineCreate, current_user: User = Depends(get_current_user)):
    """Create a new machine"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    machine_id = machine.machine_id or f"MCH-{uuid.uuid4().hex[:6].upper()}"
    
    existing = await db.machines.find_one({"machine_id": machine_id})
    if existing:
        raise HTTPException(status_code=400, detail="Machine ID already exists")
    
    machine_doc = {
        "machine_id": machine_id,
        "name": machine.name,
        "category": machine.category,
        "location": machine.location,
        "description": machine.description,
        "status": "idle",
        "current_job": None,
        "created_at": get_ist_now(),
        "created_by": current_user.user_id,
        "updated_at": get_ist_now()
    }
    
    await db.machines.insert_one(machine_doc)
    machine_doc.pop("_id", None)
    return machine_doc


@router.get("/machines/category/{category}")
async def get_machines_by_category(category: str, current_user: User = Depends(get_current_user)):
    """Get machines by category"""
    db = get_db()
    machines = await db.machines.find(
        {"category": category},
        {"_id": 0}
    ).sort("name", 1).to_list(length=100)
    return machines


@router.delete("/machines/{machine_id}")
async def delete_machine(machine_id: str, current_user: User = Depends(get_current_user)):
    """Delete a machine"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.machines.delete_one({"machine_id": machine_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    return {"message": "Machine deleted successfully"}


@router.post("/machines/{machine_id}/reset-status")
async def reset_machine_status(machine_id: str, current_user: User = Depends(get_current_user)):
    """Reset machine status to idle"""
    db = get_db()
    
    result = await db.machines.update_one(
        {"machine_id": machine_id},
        {"$set": {
            "status": "idle",
            "current_job": None,
            "updated_at": get_ist_now()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    return {"message": "Machine status reset to idle"}


@router.post("/machines/reset-all-status")
async def reset_all_machines_status(current_user: User = Depends(get_current_user)):
    """Reset all machines to idle"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.machines.update_many(
        {},
        {"$set": {
            "status": "idle",
            "current_job": None,
            "updated_at": get_ist_now()
        }}
    )
    
    return {"message": f"Reset {result.modified_count} machines to idle"}


@router.get("/operators")
async def get_operators(current_user: User = Depends(get_current_user)):
    """Get all operators"""
    db = get_db()
    operators = await db.users.find(
        {"role": {"$in": ["Operator", "Admin"]}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1}
    ).to_list(length=200)
    return operators
