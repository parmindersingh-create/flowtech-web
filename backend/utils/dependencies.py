"""Shared FastAPI dependencies"""
from fastapi import HTTPException, Request, Depends
from typing import Optional
from pydantic import BaseModel
from utils.database import get_db

# User model for auth
class User(BaseModel):
    user_id: str
    email: str
    name: str
    role: str = "Operator"
    picture: Optional[str] = None

async def get_current_user(request: Request) -> User:
    """Get the current authenticated user from session.

    Uses the new JWT-style auth (auth_v2.py): tokens are stored in
    `db.user_sessions` keyed by `session_token`. Accepts the token from
    either the `Authorization: Bearer ...` header or a `session_token` /
    `session_id` cookie.
    """
    db = get_db()

    # Bearer header has priority (web app uses this)
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

    # Fall back to cookies for legacy clients
    if not token:
        token = request.cookies.get("session_token") or request.cookies.get("session_id")

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Look up session in the unified user_sessions collection
    session = await db.user_sessions.find_one({"session_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    # Get user from session
    user_data = await db.users.find_one({"user_id": session["user_id"]})
    if not user_data:
        raise HTTPException(status_code=401, detail="User not found")

    # Honour both legacy `is_blocked` and new `is_active` flags
    if user_data.get("is_blocked", False):
        raise HTTPException(status_code=403, detail="Your account has been blocked. Contact admin.")
    if user_data.get("is_active") is False:
        raise HTTPException(status_code=403, detail="Account deactivated. Contact admin.")

    return User(
        user_id=user_data["user_id"],
        email=user_data.get("email", ""),
        name=user_data.get("name", "Unknown"),
        role=user_data.get("role", "Operator"),
        picture=user_data.get("picture")
    )

async def get_optional_user(request: Request) -> Optional[User]:
    """Get the current user if authenticated, None otherwise"""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin role (accepts legacy `Admin` plus new auth_v2 roles)."""
    role = (current_user.role or "").lower()
    if role not in {"admin", "super_admin", "manager", "hr"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
