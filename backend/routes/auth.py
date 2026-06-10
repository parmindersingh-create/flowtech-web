"""Authentication & User Management API Routes"""
from fastapi import APIRouter, HTTPException, Request, Depends, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import secrets
import os
import logging
import httpx

from utils.database import get_db, get_ist_now
from utils.dependencies import User, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["auth"])

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")


class RoleUpdate(BaseModel):
    user_id: str
    role: str


@router.post("/auth/session")
async def create_auth_session(request: Request):
    """Create auth session from Google token"""
    db = get_db()
    data = await request.json()
    
    id_token = data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="id_token required")
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid token")
            
            token_info = resp.json()
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed")
    
    email = token_info.get("email")
    name = token_info.get("name", email.split("@")[0])
    picture = token_info.get("picture")
    google_id = token_info.get("sub")
    
    user = await db.users.find_one({"email": email})
    
    if user:
        if user.get("is_blocked"):
            raise HTTPException(status_code=403, detail="Account blocked")
        user_id = user["user_id"]
        role = user.get("role", "pending")
    else:
        user_id = f"user_{secrets.token_hex(8)}"
        role = "pending"
        
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "google_id": google_id,
            "role": role,
            "created_at": get_ist_now()
        })
    
    session_id = secrets.token_hex(32)
    
    await db.sessions.insert_one({
        "session_id": session_id,
        "user_id": user_id,
        "created_at": get_ist_now(),
        "expires_at": get_ist_now() + timedelta(days=30)
    })
    
    return {
        "session_id": session_id,
        "user": {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "role": role
        }
    }


@router.get("/auth/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    db = get_db()
    session_id = request.cookies.get("session_id")
    
    if not session_id:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_id = auth_header.replace("Bearer ", "")
    
    if session_id:
        await db.sessions.delete_one({"session_id": session_id})
    
    response.delete_cookie("session_id")
    return {"message": "Logged out"}


@router.put("/auth/update-name")
async def update_user_name(request: Request, current_user: User = Depends(get_current_user)):
    """Update user's display name"""
    db = get_db()
    data = await request.json()
    new_name = data.get("name")
    
    if not new_name:
        raise HTTPException(status_code=400, detail="Name required")
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"name": new_name, "updated_at": get_ist_now()}}
    )
    
    return {"message": "Name updated", "name": new_name}


@router.get("/users")
async def get_users(current_user: User = Depends(get_current_user)):
    """Get all users (Admin only)"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    return users


@router.get("/users/stats")
async def get_user_stats(current_user: User = Depends(get_current_user)):
    """Get user statistics"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    total = await db.users.count_documents({})
    admins = await db.users.count_documents({"role": "Admin"})
    operators = await db.users.count_documents({"role": "Operator"})
    pending = await db.users.count_documents({"role": "pending"})
    blocked = await db.users.count_documents({"is_blocked": True})
    
    return {
        "total": total,
        "admins": admins,
        "operators": operators,
        "pending": pending,
        "blocked": blocked
    }


@router.put("/users/role")
async def update_user_role(data: RoleUpdate, current_user: User = Depends(get_current_user)):
    """Update user role"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if data.role not in ["Admin", "Operator", "Viewer", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    result = await db.users.update_one(
        {"user_id": data.user_id},
        {"$set": {"role": data.role, "updated_at": get_ist_now()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": f"Role updated to {data.role}"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    """Delete a user"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    await db.users.delete_one({"user_id": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    
    return {"message": "User deleted"}


@router.post("/users/{user_id}/block")
async def block_user(user_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Block or unblock a user"""
    db = get_db()
    if (current_user.role or "").lower() not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    data = await request.json()
    is_blocked = data.get("is_blocked", True)
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_blocked": is_blocked, "updated_at": get_ist_now()}}
    )
    
    if is_blocked:
        await db.sessions.delete_many({"user_id": user_id})
    
    return {"message": f"User {'blocked' if is_blocked else 'unblocked'}"}


@router.post("/users/select-role")
async def select_role(request: Request, current_user: User = Depends(get_current_user)):
    """User selects their role (first time setup)"""
    db = get_db()
    data = await request.json()
    role = data.get("role")
    
    if role not in ["Admin", "Operator"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    if current_user.role != "pending":
        raise HTTPException(status_code=400, detail="Role already selected")
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"role": role, "updated_at": get_ist_now()}}
    )
    
    return {"message": f"Role set to {role}", "role": role}


@router.get("/users/assignable")
async def get_assignable_users(current_user: User = Depends(get_current_user)):
    """Get users that can be assigned to jobs"""
    db = get_db()
    users = await db.users.find(
        {"role": {"$in": ["Admin", "Operator"]}, "is_blocked": {"$ne": True}},
        {"_id": 0, "user_id": 1, "name": 1, "role": 1}
    ).to_list(length=200)
    return users
