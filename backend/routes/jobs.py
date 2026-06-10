"""Jobs & Production Tracking API Routes"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import uuid
import logging

from utils.database import get_db, get_ist_now, get_current_shift, get_shift_end_time
from utils.dependencies import User, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["jobs"])


class JobCreate(BaseModel):
    job_number: str
    machine_id: str
    part_name: str
    part_number: Optional[str] = None
    target_quantity: int
    priority: Optional[str] = "normal"
    notes: Optional[str] = None


class ProductionStart(BaseModel):
    job_id: str
    machine_id: str
    notes: Optional[str] = None


class QtyPost(BaseModel):
    ok_qty: int = 0
    ng_qty: int = 0
    notes: Optional[str] = None


@router.get("/jobs")
async def get_jobs(
    status: Optional[str] = None,
    machine_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get all jobs"""
    db = get_db()
    query = {}
    
    if status:
        query["status"] = status
    if machine_id:
        query["machine_id"] = machine_id
    
    jobs = await db.jobs.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    return jobs


@router.get("/jobs/available")
async def get_available_jobs(current_user: User = Depends(get_current_user)):
    """Get jobs available to start"""
    db = get_db()
    jobs = await db.jobs.find(
        {"status": {"$in": ["pending", "ready"]}},
        {"_id": 0}
    ).sort("priority", -1).to_list(length=100)
    return jobs


@router.get("/jobs/my-assigned")
async def get_my_assigned_jobs(current_user: User = Depends(get_current_user)):
    """Get jobs assigned to current user"""
    db = get_db()
    jobs = await db.jobs.find(
        {"assigned_to": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=100)
    return jobs


@router.get("/jobs/active")
async def get_active_jobs(current_user: User = Depends(get_current_user)):
    """Get currently active jobs"""
    db = get_db()
    jobs = await db.jobs.find(
        {"status": "in_progress"},
        {"_id": 0}
    ).to_list(length=100)
    return jobs


@router.post("/jobs")
async def create_job(job: JobCreate, current_user: User = Depends(get_current_user)):
    """Create a new job"""
    db = get_db()
    
    job_id = f"JOB-{uuid.uuid4().hex[:8].upper()}"
    
    job_doc = {
        "job_id": job_id,
        "job_number": job.job_number,
        "machine_id": job.machine_id,
        "part_name": job.part_name,
        "part_number": job.part_number,
        "target_quantity": job.target_quantity,
        "completed_quantity": 0,
        "ng_quantity": 0,
        "priority": job.priority or "normal",
        "status": "pending",
        "notes": job.notes,
        "assigned_to": None,
        "created_by": current_user.user_id,
        "created_by_name": current_user.name,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    }
    
    await db.jobs.insert_one(job_doc)
    job_doc.pop("_id", None)
    return job_doc


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Get a single job"""
    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.put("/jobs/{job_id}")
async def update_job(job_id: str, update_data: dict, current_user: User = Depends(get_current_user)):
    """Update a job"""
    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    allowed_fields = ["job_number", "part_name", "part_number", "target_quantity", 
                      "priority", "notes", "status", "assigned_to"]
    update_dict = {k: v for k, v in update_data.items() if k in allowed_fields}
    update_dict["updated_at"] = get_ist_now()
    
    await db.jobs.update_one({"job_id": job_id}, {"$set": update_dict})
    
    updated = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    return updated


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, current_user: User = Depends(get_current_user)):
    """Delete a job"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.jobs.delete_one({"job_id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {"message": "Job deleted successfully"}


@router.post("/jobs/{job_id}/comments")
async def add_job_comment(job_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Add comment to a job"""
    db = get_db()
    data = await request.json()
    
    comment = {
        "comment_id": f"CMT-{uuid.uuid4().hex[:8]}",
        "job_id": job_id,
        "text": data.get("text", ""),
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "created_at": get_ist_now()
    }
    
    await db.job_comments.insert_one(comment)
    comment.pop("_id", None)
    return comment


@router.get("/jobs/{job_id}/comments")
async def get_job_comments(job_id: str, current_user: User = Depends(get_current_user)):
    """Get comments for a job"""
    db = get_db()
    comments = await db.job_comments.find(
        {"job_id": job_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=100)
    return comments


# Production Tracking
@router.post("/production/start")
async def start_production(data: ProductionStart, current_user: User = Depends(get_current_user)):
    """Start production on a job"""
    db = get_db()
    
    job = await db.jobs.find_one({"job_id": data.job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    existing = await db.active_work.find_one({
        "job_id": data.job_id,
        "status": "active"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Production already active for this job")
    
    entry_id = f"PROD-{uuid.uuid4().hex[:8].upper()}"
    now = get_ist_now()
    
    entry = {
        "entry_id": entry_id,
        "job_id": data.job_id,
        "machine_id": data.machine_id,
        "operator_id": current_user.user_id,
        "operator_name": current_user.name,
        "status": "active",
        "shift": get_current_shift(),
        "start_time": now,
        "end_time": None,
        "ok_qty": 0,
        "ng_qty": 0,
        "notes": data.notes,
        "qty_posts": [],
        "created_at": now
    }
    
    await db.active_work.insert_one(entry)
    
    await db.jobs.update_one(
        {"job_id": data.job_id},
        {"$set": {"status": "in_progress", "updated_at": now}}
    )
    
    await db.machines.update_one(
        {"machine_id": data.machine_id},
        {"$set": {"status": "running", "current_job": data.job_id, "updated_at": now}}
    )
    
    entry.pop("_id", None)
    return entry


@router.get("/production/active")
async def get_active_production(current_user: User = Depends(get_current_user)):
    """Get all active production entries"""
    db = get_db()
    entries = await db.active_work.find(
        {"status": "active"},
        {"_id": 0}
    ).to_list(length=100)
    return entries


@router.post("/production/{entry_id}/post-qty")
async def post_production_qty(entry_id: str, data: QtyPost, current_user: User = Depends(get_current_user)):
    """Post quantity update for active production"""
    db = get_db()
    
    entry = await db.active_work.find_one({"entry_id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Production entry not found")
    
    if entry["status"] != "active":
        raise HTTPException(status_code=400, detail="Production is not active")
    
    now = get_ist_now()
    
    post = {
        "ok_qty": data.ok_qty,
        "ng_qty": data.ng_qty,
        "notes": data.notes,
        "posted_by": current_user.user_id,
        "posted_at": now
    }
    
    await db.active_work.update_one(
        {"entry_id": entry_id},
        {
            "$inc": {"ok_qty": data.ok_qty, "ng_qty": data.ng_qty},
            "$push": {"qty_posts": post}
        }
    )
    
    if entry.get("job_id"):
        await db.jobs.update_one(
            {"job_id": entry["job_id"]},
            {"$inc": {"completed_quantity": data.ok_qty, "ng_quantity": data.ng_qty}}
        )
    
    return {"message": "Quantity posted", "ok_qty": data.ok_qty, "ng_qty": data.ng_qty}


@router.post("/production/end/{entry_id}")
async def end_production(entry_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """End production entry"""
    db = get_db()
    data = await request.json()
    
    entry = await db.active_work.find_one({"entry_id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Production entry not found")
    
    if entry["status"] != "active":
        raise HTTPException(status_code=400, detail="Production is not active")
    
    now = get_ist_now()
    
    await db.active_work.update_one(
        {"entry_id": entry_id},
        {"$set": {
            "status": "completed",
            "end_time": now,
            "end_reason": data.get("reason", "manual"),
            "ended_by": current_user.user_id
        }}
    )
    
    if entry.get("machine_id"):
        await db.machines.update_one(
            {"machine_id": entry["machine_id"]},
            {"$set": {"status": "idle", "current_job": None, "updated_at": now}}
        )
    
    return {"message": "Production ended", "entry_id": entry_id}


@router.get("/shift/current")
async def get_current_shift_info(current_user: User = Depends(get_current_user)):
    """Get current shift information"""
    return {
        "shift": get_current_shift(),
        "shift_end": get_shift_end_time().isoformat(),
        "current_time": get_ist_now().isoformat()
    }


@router.get("/production/all-active-machine-work")
async def get_all_active_machine_work(current_user: User = Depends(get_current_user)):
    """Get all active work by machine"""
    db = get_db()
    entries = await db.active_work.find(
        {"status": "active"},
        {"_id": 0}
    ).to_list(length=100)
    
    by_machine = {}
    for entry in entries:
        machine_id = entry.get("machine_id", "unknown")
        if machine_id not in by_machine:
            by_machine[machine_id] = []
        by_machine[machine_id].append(entry)
    
    return by_machine
