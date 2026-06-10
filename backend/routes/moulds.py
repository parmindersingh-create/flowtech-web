"""Mould Management API Routes"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from utils.database import get_db, get_ist_now
from utils.dependencies import User, get_current_user

router = APIRouter(prefix="/api/moulds", tags=["moulds"])

# Pydantic Models
class MouldCreate(BaseModel):
    serial_no: str
    mould_category: str  # injection_mould, gravity_mould, pressure_die_casting, vacuum_forming
    mould_name: str
    assembly_name: Optional[str] = None
    designer_mould_no: Optional[str] = None
    factory_mould_no: Optional[str] = None
    location_place: Optional[str] = None
    location_rack: Optional[str] = None
    article_image: Optional[str] = None
    core_cavity_image: Optional[str] = None
    remarks: Optional[str] = None

class MouldGiveReturn(BaseModel):
    action: str  # "give" or "return"
    operator_name: str
    purpose: Optional[str] = None
    signature: Optional[str] = None


@router.get("")
async def get_all_moulds(current_user: User = Depends(get_current_user)):
    """Get all moulds with their current status"""
    db = get_db()
    moulds = await db.moulds.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    return moulds


@router.post("")
async def create_mould(mould: MouldCreate, current_user: User = Depends(get_current_user)):
    """Create a new mould entry"""
    db = get_db()
    
    # Check for duplicate serial_no
    existing = await db.moulds.find_one({"serial_no": mould.serial_no})
    if existing:
        raise HTTPException(status_code=400, detail="Mould with this serial number already exists")
    
    mould_doc = {
        "mould_id": f"mould_{uuid.uuid4().hex[:12]}",
        "serial_no": mould.serial_no,
        "mould_category": mould.mould_category,
        "mould_name": mould.mould_name,
        "assembly_name": mould.assembly_name,
        "designer_mould_no": mould.designer_mould_no,
        "factory_mould_no": mould.factory_mould_no,
        "location_place": mould.location_place,
        "location_rack": mould.location_rack,
        "article_image": mould.article_image,
        "core_cavity_image": mould.core_cavity_image,
        "remarks": mould.remarks,
        "status": "available",  # available, with_user, maintenance
        "current_holder": None,
        "current_holder_name": None,
        "given_at": None,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user.user_id,
        "created_by_name": current_user.name,
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.moulds.insert_one(mould_doc)
    mould_doc.pop("_id", None)
    return mould_doc


@router.get("/{mould_id}")
async def get_mould(mould_id: str, current_user: User = Depends(get_current_user)):
    """Get single mould details"""
    db = get_db()
    mould = await db.moulds.find_one({"mould_id": mould_id}, {"_id": 0})
    if not mould:
        raise HTTPException(status_code=404, detail="Mould not found")
    return mould


@router.put("/{mould_id}")
async def update_mould(mould_id: str, update_data: dict, current_user: User = Depends(get_current_user)):
    """Update mould details"""
    db = get_db()
    mould = await db.moulds.find_one({"mould_id": mould_id})
    if not mould:
        raise HTTPException(status_code=404, detail="Mould not found")
    
    allowed_fields = ["serial_no", "mould_category", "mould_name", "assembly_name", "designer_mould_no", 
                      "factory_mould_no", "location_place", "location_rack",
                      "article_image", "core_cavity_image", "remarks"]
    
    update_dict = {k: v for k, v in update_data.items() if k in allowed_fields}
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    await db.moulds.update_one({"mould_id": mould_id}, {"$set": update_dict})
    
    updated = await db.moulds.find_one({"mould_id": mould_id}, {"_id": 0})
    return updated


@router.delete("/{mould_id}")
async def delete_mould(mould_id: str, current_user: User = Depends(get_current_user)):
    """Delete a mould (Admin only)"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.moulds.delete_one({"mould_id": mould_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mould not found")
    
    return {"message": "Mould deleted successfully"}


@router.post("/{mould_id}/transaction")
async def mould_give_return(mould_id: str, data: MouldGiveReturn, current_user: User = Depends(get_current_user)):
    """Give or return a mould"""
    db = get_db()
    mould = await db.moulds.find_one({"mould_id": mould_id})
    if not mould:
        raise HTTPException(status_code=404, detail="Mould not found")
    
    now = datetime.now(timezone.utc)
    ist_now = get_ist_now()
    
    if data.action == "give":
        if mould.get("status") == "with_user":
            raise HTTPException(status_code=400, detail=f"Mould is already with {mould.get('current_holder_name')}")
        
        # Update mould status
        await db.moulds.update_one({"mould_id": mould_id}, {"$set": {
            "status": "with_user",
            "current_holder_name": data.operator_name,
            "given_at": now,
            "updated_at": now
        }})
        
        # Create transaction record
        transaction = {
            "transaction_id": f"mt_{uuid.uuid4().hex[:12]}",
            "mould_id": mould_id,
            "mould_name": mould.get("mould_name"),
            "serial_no": mould.get("serial_no"),
            "action": "give",
            "operator_name": data.operator_name,
            "purpose": data.purpose,
            "signature": data.signature,
            "given_by": current_user.name,
            "given_at": now,
            "given_at_ist": ist_now.strftime("%d/%m/%Y %I:%M %p"),
            "returned_at": None,
            "return_signature": None
        }
        await db.mould_transactions.insert_one(transaction)
        
        return {"message": f"Mould given to {data.operator_name}", "status": "with_user"}
    
    elif data.action == "return":
        if mould.get("status") != "with_user":
            raise HTTPException(status_code=400, detail="Mould is not currently issued")
        
        # Update mould status
        await db.moulds.update_one({"mould_id": mould_id}, {"$set": {
            "status": "available",
            "current_holder_name": None,
            "given_at": None,
            "updated_at": now
        }})
        
        # Update latest transaction with return info
        await db.mould_transactions.update_one(
            {"mould_id": mould_id, "returned_at": None},
            {"$set": {
                "returned_at": now,
                "returned_at_ist": ist_now.strftime("%d/%m/%Y %I:%M %p"),
                "return_signature": data.signature,
                "returned_to": current_user.name
            }},
            sort=[("given_at", -1)]
        )
        
        return {"message": "Mould returned successfully", "status": "available"}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'give' or 'return'")


@router.get("/{mould_id}/history")
async def get_mould_history(mould_id: str, current_user: User = Depends(get_current_user)):
    """Get transaction history for a mould"""
    db = get_db()
    transactions = await db.mould_transactions.find(
        {"mould_id": mould_id}, 
        {"_id": 0}
    ).sort("given_at", -1).to_list(length=100)
    
    return {"transactions": transactions}
