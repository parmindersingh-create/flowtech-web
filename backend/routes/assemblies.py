"""Assembly Management API Routes"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
import logging

from utils.database import get_db, get_ist_now
from utils.dependencies import User, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["assemblies"])


class AssemblyCreate(BaseModel):
    name: str
    assembly_id: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    image: Optional[str] = None


class AssemblyPartAdd(BaseModel):
    part_id: str
    quantity: int = 1


@router.get("/assemblies")
async def get_assemblies(
    category: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get all assemblies"""
    db = get_db()
    query = {}
    
    if category:
        query["category"] = category
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"assembly_id": {"$regex": search, "$options": "i"}}
        ]
    
    assemblies = await db.assemblies.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    
    for assembly in assemblies:
        parts_count = await db.assembly_parts.count_documents({"assembly_id": assembly["assembly_id"]})
        assembly["parts_count"] = parts_count
    
    return assemblies


@router.post("/assemblies")
async def create_assembly(assembly: AssemblyCreate, current_user: User = Depends(get_current_user)):
    """Create a new assembly"""
    db = get_db()
    
    assembly_id = assembly.assembly_id or f"ASM-{uuid.uuid4().hex[:8].upper()}"
    
    existing = await db.assemblies.find_one({"assembly_id": assembly_id})
    if existing:
        raise HTTPException(status_code=400, detail="Assembly ID already exists")
    
    assembly_doc = {
        "assembly_id": assembly_id,
        "name": assembly.name,
        "description": assembly.description,
        "category": assembly.category,
        "image": assembly.image,
        "created_at": get_ist_now(),
        "created_by": current_user.user_id,
        "updated_at": get_ist_now()
    }
    
    await db.assemblies.insert_one(assembly_doc)
    assembly_doc.pop("_id", None)
    return assembly_doc


@router.get("/assemblies/{assembly_id}")
async def get_assembly(assembly_id: str, current_user: User = Depends(get_current_user)):
    """Get assembly with its parts"""
    db = get_db()
    assembly = await db.assemblies.find_one({"assembly_id": assembly_id}, {"_id": 0})
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    
    assembly_parts = await db.assembly_parts.find(
        {"assembly_id": assembly_id},
        {"_id": 0}
    ).to_list(length=500)
    
    parts_with_details = []
    for ap in assembly_parts:
        part = await db.parts_library.find_one({"part_id": ap["part_id"]}, {"_id": 0})
        if part:
            part["quantity"] = ap.get("quantity", 1)
            parts_with_details.append(part)
    
    assembly["parts"] = parts_with_details
    return assembly


@router.put("/assemblies/{assembly_id}")
async def update_assembly(assembly_id: str, update_data: dict, current_user: User = Depends(get_current_user)):
    """Update assembly details"""
    db = get_db()
    assembly = await db.assemblies.find_one({"assembly_id": assembly_id})
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    
    allowed_fields = ["name", "description", "category", "image"]
    update_dict = {k: v for k, v in update_data.items() if k in allowed_fields}
    update_dict["updated_at"] = get_ist_now()
    
    await db.assemblies.update_one({"assembly_id": assembly_id}, {"$set": update_dict})
    
    updated = await db.assemblies.find_one({"assembly_id": assembly_id}, {"_id": 0})
    return updated


@router.delete("/assemblies/{assembly_id}")
async def delete_assembly(assembly_id: str, current_user: User = Depends(get_current_user)):
    """Delete an assembly"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.assemblies.delete_one({"assembly_id": assembly_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assembly not found")
    
    await db.assembly_parts.delete_many({"assembly_id": assembly_id})
    
    return {"message": "Assembly deleted successfully"}


@router.post("/assemblies/{assembly_id}/parts")
async def add_part_to_assembly(
    assembly_id: str,
    data: AssemblyPartAdd,
    current_user: User = Depends(get_current_user)
):
    """Add a part to an assembly"""
    db = get_db()
    assembly = await db.assemblies.find_one({"assembly_id": assembly_id})
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    
    part = await db.parts_library.find_one({"part_id": data.part_id})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    
    existing = await db.assembly_parts.find_one({
        "assembly_id": assembly_id,
        "part_id": data.part_id
    })
    
    if existing:
        await db.assembly_parts.update_one(
            {"assembly_id": assembly_id, "part_id": data.part_id},
            {"$inc": {"quantity": data.quantity}}
        )
    else:
        await db.assembly_parts.insert_one({
            "assembly_id": assembly_id,
            "part_id": data.part_id,
            "quantity": data.quantity,
            "added_at": get_ist_now(),
            "added_by": current_user.user_id
        })
    
    return {"message": f"Part {data.part_id} added to assembly"}


@router.delete("/assemblies/{assembly_id}/parts/{part_id}")
async def remove_part_from_assembly(
    assembly_id: str,
    part_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a part from an assembly"""
    db = get_db()
    result = await db.assembly_parts.delete_one({
        "assembly_id": assembly_id,
        "part_id": part_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Part not found in assembly")
    
    return {"message": f"Part {part_id} removed from assembly"}


@router.put("/assemblies/{assembly_id}/parts/{part_id}")
async def update_assembly_part(
    assembly_id: str,
    part_id: str,
    update_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Update part quantity in assembly"""
    db = get_db()
    
    result = await db.assembly_parts.update_one(
        {"assembly_id": assembly_id, "part_id": part_id},
        {"$set": {"quantity": update_data.get("quantity", 1)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Part not found in assembly")
    
    return {"message": "Part quantity updated"}


@router.post("/assemblies/{assembly_id}/parts/search-similar")
async def search_similar_parts(
    assembly_id: str,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Search for similar parts to add"""
    db = get_db()
    data = await request.json()
    search_term = data.get("search", "")
    
    if not search_term:
        return []
    
    parts = await db.parts_library.find({
        "$or": [
            {"name": {"$regex": search_term, "$options": "i"}},
            {"part_id": {"$regex": search_term, "$options": "i"}},
            {"description": {"$regex": search_term, "$options": "i"}}
        ]
    }, {"_id": 0}).limit(20).to_list(length=20)
    
    return parts


@router.post("/assemblies/{assembly_id}/parts/create-and-add")
async def create_and_add_part(
    assembly_id: str,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Create a new part and add it to assembly"""
    db = get_db()
    data = await request.json()
    
    assembly = await db.assemblies.find_one({"assembly_id": assembly_id})
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    
    part_id = data.get("part_id") or f"PT-{uuid.uuid4().hex[:8].upper()}"
    
    existing = await db.parts_library.find_one({"part_id": part_id})
    if existing:
        raise HTTPException(status_code=400, detail="Part ID already exists")
    
    part_doc = {
        "part_id": part_id,
        "category": data.get("category", "general"),
        "part_type": data.get("part_type", "general"),
        "name": data.get("name", "New Part"),
        "size": data.get("size"),
        "length": data.get("length"),
        "material": data.get("material"),
        "description": data.get("description"),
        "min_stock": data.get("min_stock", 0),
        "current_stock": data.get("current_stock", 0),
        "unit": data.get("unit", "pcs"),
        "created_at": get_ist_now(),
        "created_by": current_user.user_id,
        "updated_at": get_ist_now()
    }
    
    await db.parts_library.insert_one(part_doc)
    
    await db.assembly_parts.insert_one({
        "assembly_id": assembly_id,
        "part_id": part_id,
        "quantity": data.get("quantity", 1),
        "added_at": get_ist_now(),
        "added_by": current_user.user_id
    })
    
    part_doc.pop("_id", None)
    return {"part": part_doc, "message": f"Part {part_id} created and added to assembly"}


# Manage Assemblies Module
@router.get("/manage/assemblies")
async def get_manage_assemblies(current_user: User = Depends(get_current_user)):
    """Get all assemblies for management view"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    assemblies = await db.assemblies.find({}, {"_id": 0}).sort("name", 1).to_list(length=500)
    
    for assembly in assemblies:
        parts_count = await db.assembly_parts.count_documents({"assembly_id": assembly["assembly_id"]})
        assembly["parts_count"] = parts_count
    
    return assemblies


@router.get("/manage/assemblies/{assembly_id}/parts")
async def get_assembly_parts_for_manage(assembly_id: str, current_user: User = Depends(get_current_user)):
    """Get parts of an assembly for management"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    assembly = await db.assemblies.find_one({"assembly_id": assembly_id}, {"_id": 0})
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    
    assembly_parts = await db.assembly_parts.find({"assembly_id": assembly_id}).to_list(length=500)
    
    parts = []
    for ap in assembly_parts:
        part = await db.parts_library.find_one({"part_id": ap["part_id"]}, {"_id": 0})
        if part:
            part["quantity"] = ap.get("quantity", 1)
            
            other_assemblies = await db.assembly_parts.find({
                "part_id": ap["part_id"],
                "assembly_id": {"$ne": assembly_id}
            }).to_list(length=50)
            
            part["shared_with"] = [oa["assembly_id"] for oa in other_assemblies]
            part["is_shared"] = len(other_assemblies) > 0
            parts.append(part)
    
    return {"assembly": assembly, "parts": parts}


@router.get("/manage/assemblies/{assembly_id}/delete-preview")
async def preview_assembly_delete(assembly_id: str, current_user: User = Depends(get_current_user)):
    """Preview what will happen when deleting an assembly"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    assembly = await db.assemblies.find_one({"assembly_id": assembly_id}, {"_id": 0})
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    
    assembly_parts = await db.assembly_parts.find({"assembly_id": assembly_id}).to_list(length=500)
    
    exclusive_parts = []
    shared_parts = []
    
    for ap in assembly_parts:
        part = await db.parts_library.find_one({"part_id": ap["part_id"]}, {"_id": 0})
        if not part:
            continue
        
        other_uses = await db.assembly_parts.count_documents({
            "part_id": ap["part_id"],
            "assembly_id": {"$ne": assembly_id}
        })
        
        if other_uses == 0:
            exclusive_parts.append(part)
        else:
            part["other_assemblies_count"] = other_uses
            shared_parts.append(part)
    
    return {
        "assembly": assembly,
        "exclusive_parts": exclusive_parts,
        "shared_parts": shared_parts,
        "exclusive_count": len(exclusive_parts),
        "shared_count": len(shared_parts)
    }


@router.put("/manage/parts/{part_id}/correct-id")
async def correct_part_id(part_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Correct/change a part ID"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    data = await request.json()
    new_part_id = data.get("new_part_id")
    
    if not new_part_id:
        raise HTTPException(status_code=400, detail="new_part_id required")
    
    existing = await db.parts_library.find_one({"part_id": new_part_id})
    if existing:
        raise HTTPException(status_code=400, detail="New part ID already exists")
    
    part = await db.parts_library.find_one({"part_id": part_id})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    
    await db.parts_library.update_one(
        {"part_id": part_id},
        {"$set": {"part_id": new_part_id, "updated_at": get_ist_now()}}
    )
    
    await db.assembly_parts.update_many(
        {"part_id": part_id},
        {"$set": {"part_id": new_part_id}}
    )
    
    return {"message": f"Part ID changed from {part_id} to {new_part_id}"}


@router.get("/manage/parts/search")
async def search_parts_for_manage(q: str, current_user: User = Depends(get_current_user)):
    """Search parts for management"""
    db = get_db()
    
    parts = await db.parts_library.find({
        "$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"part_id": {"$regex": q, "$options": "i"}}
        ]
    }, {"_id": 0}).limit(50).to_list(length=50)
    
    return parts
