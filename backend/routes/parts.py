"""Parts Library & BOM Management API Routes"""
from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
import logging

from utils.database import get_db, get_ist_now
from utils.dependencies import User, get_current_user, get_optional_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["parts"])


class PartCreate(BaseModel):
    category: str
    part_type: str
    name: str
    size: Optional[str] = None
    length: Optional[str] = None
    material: Optional[str] = None
    description: Optional[str] = None
    min_stock: Optional[int] = 0
    current_stock: Optional[int] = 0
    unit: Optional[str] = "pcs"
    supplier: Optional[str] = None
    price: Optional[float] = None
    image: Optional[str] = None


class StockUpdate(BaseModel):
    quantity: int
    reason: Optional[str] = None


@router.get("/parts-library")
async def get_parts_library(
    category: Optional[str] = None,
    part_type: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get all parts with optional filters"""
    db = get_db()
    query = {}
    
    if category:
        query["category"] = category
    if part_type:
        query["part_type"] = part_type
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"part_id": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    parts = await db.parts_library.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
    return parts


@router.get("/parts-library/categories")
async def get_part_categories(current_user: User = Depends(get_current_user)):
    """Get distinct categories"""
    db = get_db()
    categories = await db.parts_library.distinct("category")
    return categories


@router.get("/parts-library/types")
async def get_part_types(category: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Get distinct types for a category"""
    db = get_db()
    query = {}
    if category:
        query["category"] = category
    types = await db.parts_library.distinct("part_type", query)
    return types


@router.get("/parts-library/next-serial")
async def get_next_serial(category: str, part_type: str, current_user: User = Depends(get_current_user)):
    """Get next serial number for a category/type"""
    db = get_db()
    
    prefix_map = {
        "oring": "OR",
        "pipe": "PP", 
        "spring": "SP",
        "fastener": "FS",
        "seal": "SL",
        "bearing": "BR",
        "filter": "FL",
        "valve": "VL",
        "general": "GN"
    }
    
    prefix = prefix_map.get(part_type.lower(), part_type[:2].upper())
    
    last_part = await db.parts_library.find_one(
        {"part_id": {"$regex": f"^{prefix}"}},
        sort=[("part_id", -1)]
    )
    
    if last_part:
        try:
            last_num = int(last_part["part_id"].replace(prefix, ""))
            next_num = last_num + 1
        except:
            next_num = 1
    else:
        next_num = 1
    
    return {"next_serial": f"{prefix}{str(next_num).zfill(4)}"}


@router.post("/parts-library")
async def create_part(part: PartCreate, current_user: User = Depends(get_current_user)):
    """Create a new part"""
    db = get_db()
    
    serial_data = await get_next_serial(part.category, part.part_type, current_user)
    part_id = serial_data["next_serial"]
    
    part_doc = {
        "part_id": part_id,
        "category": part.category,
        "part_type": part.part_type,
        "name": part.name,
        "size": part.size,
        "length": part.length,
        "material": part.material,
        "description": part.description,
        "min_stock": part.min_stock or 0,
        "current_stock": part.current_stock or 0,
        "unit": part.unit or "pcs",
        "supplier": part.supplier,
        "price": part.price,
        "image": part.image,
        "created_at": get_ist_now(),
        "created_by": current_user.user_id,
        "updated_at": get_ist_now()
    }
    
    await db.parts_library.insert_one(part_doc)
    part_doc.pop("_id", None)
    return part_doc


@router.get("/parts-library/{part_id}")
async def get_part(part_id: str, current_user: User = Depends(get_current_user)):
    """Get a single part by ID"""
    db = get_db()
    part = await db.parts_library.find_one({"part_id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    return part


@router.put("/parts-library/{part_id}")
async def update_part(part_id: str, update_data: dict, current_user: User = Depends(get_current_user)):
    """Update a part"""
    db = get_db()
    part = await db.parts_library.find_one({"part_id": part_id})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    
    allowed_fields = ["name", "size", "length", "material", "description", 
                      "min_stock", "current_stock", "unit", "supplier", "price", "image"]
    update_dict = {k: v for k, v in update_data.items() if k in allowed_fields}
    update_dict["updated_at"] = get_ist_now()
    
    await db.parts_library.update_one({"part_id": part_id}, {"$set": update_dict})
    
    updated = await db.parts_library.find_one({"part_id": part_id}, {"_id": 0})
    return updated


@router.delete("/parts-library/{part_id}")
async def delete_part(part_id: str, current_user: User = Depends(get_current_user)):
    """Delete a part"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.parts_library.delete_one({"part_id": part_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Part not found")
    
    return {"message": "Part deleted successfully"}


@router.post("/parts-library/{part_id}/add-stock")
async def add_stock(part_id: str, data: StockUpdate, current_user: User = Depends(get_current_user)):
    """Add stock to a part"""
    db = get_db()
    part = await db.parts_library.find_one({"part_id": part_id})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    
    new_stock = (part.get("current_stock") or 0) + data.quantity
    
    await db.parts_library.update_one(
        {"part_id": part_id},
        {"$set": {"current_stock": new_stock, "updated_at": get_ist_now()}}
    )
    
    await db.stock_transactions.insert_one({
        "part_id": part_id,
        "type": "add",
        "quantity": data.quantity,
        "reason": data.reason,
        "new_stock": new_stock,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "timestamp": get_ist_now()
    })
    
    return {"message": f"Added {data.quantity} to stock", "new_stock": new_stock}


@router.post("/parts-library/{part_id}/deduct-stock")
async def deduct_stock(part_id: str, data: StockUpdate, current_user: User = Depends(get_current_user)):
    """Deduct stock from a part"""
    db = get_db()
    part = await db.parts_library.find_one({"part_id": part_id})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    
    current = part.get("current_stock") or 0
    if data.quantity > current:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {current}")
    
    new_stock = current - data.quantity
    
    await db.parts_library.update_one(
        {"part_id": part_id},
        {"$set": {"current_stock": new_stock, "updated_at": get_ist_now()}}
    )
    
    await db.stock_transactions.insert_one({
        "part_id": part_id,
        "type": "deduct",
        "quantity": data.quantity,
        "reason": data.reason,
        "new_stock": new_stock,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "timestamp": get_ist_now()
    })
    
    return {"message": f"Deducted {data.quantity} from stock", "new_stock": new_stock}


@router.get("/parts-library/where-used/{common_part_id}")
async def get_where_used(common_part_id: str, current_user: User = Depends(get_current_user)):
    """Get assemblies where a part is used"""
    db = get_db()
    
    assembly_parts = await db.assembly_parts.find(
        {"part_id": common_part_id}
    ).to_list(length=100)
    
    assembly_ids = [ap["assembly_id"] for ap in assembly_parts]
    
    assemblies = await db.assemblies.find(
        {"assembly_id": {"$in": assembly_ids}},
        {"_id": 0}
    ).to_list(length=100)
    
    return {
        "part_id": common_part_id,
        "used_in_count": len(assemblies),
        "assemblies": assemblies
    }
