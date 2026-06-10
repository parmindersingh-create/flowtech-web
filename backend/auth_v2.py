"""
Username/password authentication + user management.

This module replaces Google OAuth on the web. It writes new session tokens
into the existing `user_sessions` collection so that the legacy
`get_current_user()` dependency in server.py keeps working untouched.

Endpoints:
  POST  /api/auth/login              -> {username, password} -> {session_token, user}
  POST  /api/auth/change-password    -> {old_password, new_password}
  GET   /api/users                   -> list users (admin)
  POST  /api/users                   -> create user
  PUT   /api/users/{user_id}         -> update user (name, role, is_active)
  POST  /api/users/{user_id}/reset-password
  DELETE /api/users/{user_id}        -> sets is_active=False
  GET   /api/roles                   -> built-in + custom roles
  POST  /api/roles                   -> add custom role (admin)
"""
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import bcrypt
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

# ───── DB handle ─────
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'test_database')
_client = AsyncIOMotorClient(mongo_url)
db = _client[db_name]

# ───── Constants ─────
DEFAULT_ROLES = [
    "super_admin",
    "manager",
    "hr",
    "office_staff",
    "operator_vmc",
    "operator_cnc",
    "operator_moulding",
    "programmer_vmc",
    "programmer_cnc",
    "fitter",
    "general_fitter",
    "polisher",
    "die_maker",
    "turner",
]
ADMIN_ROLES = {"super_admin", "manager", "hr"}
SESSION_DAYS = 30
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,30}$")

# Minimum APK version that may log in. Below this -> HTTP 426 Upgrade Required.
# Override in env via MIN_APK_VERSION.
MIN_APK_VERSION = os.environ.get("MIN_APK_VERSION", "1.1.44")

def _version_tuple(v: str) -> tuple:
    """Parse '1.1.43' -> (1,1,43). Bad input -> (0,) so it's "older than anything"."""
    try:
        return tuple(int(p) for p in re.findall(r"\d+", str(v or ""))[:4]) or (0,)
    except Exception:
        return (0,)

# ───── Models ─────
class LoginIn(BaseModel):
    username: str
    password: str
    # Optional client telemetry — sent by APK and web app
    client: Optional[str] = None      # "apk" | "web" | None
    app_version: Optional[str] = None # e.g. "1.1.43"
    device_info: Optional[str] = None # free-form, e.g. device model + OS

class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str

class UserCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    username: str
    password: str
    role: str
    email: Optional[str] = ""

class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    username: Optional[str] = None  # admin can assign/change username
    phone: Optional[str] = None  # WhatsApp phone (E.164 or 10-digit IN)

class ResetPasswordIn(BaseModel):
    new_password: str

class RoleIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=40)

# ───── Helpers ─────
def hash_password(plain: str) -> str:
    if not plain or len(plain) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def normalize_username(u: str) -> str:
    u = (u or "").strip().lower()
    if not USERNAME_RE.match(u):
        raise HTTPException(status_code=400, detail="Invalid username (3-30 chars, lowercase letters/digits/._-)")
    return u

async def get_all_roles() -> List[str]:
    custom = [r["name"] async for r in db.roles.find({}, {"_id": 0, "name": 1})]
    return sorted(set(DEFAULT_ROLES + custom))

async def assert_role_valid(role: str):
    if role not in await get_all_roles():
        raise HTTPException(status_code=400, detail=f"Unknown role: {role}")

async def get_current_user_from_request(request: Request) -> dict:
    """Looks up session_token -> user. Mirrors legacy get_current_user but
    returns a plain dict (so legacy User model continues to work too)."""
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = sess.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            exp = None
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("is_active") is False:
        raise HTTPException(status_code=403, detail="User deactivated")
    return user

async def require_admin(request: Request) -> dict:
    u = await get_current_user_from_request(request)
    if u.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")
    return u

async def require_super_admin(request: Request) -> dict:
    u = await get_current_user_from_request(request)
    if u.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    return u

def public_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k != "password_hash"}

# ───── Router ─────
router = APIRouter()

@router.get("/api/auth/version-policy")
async def version_policy():
    """Public endpoint — APK should call this on startup to know if it
    needs to force the user to update before allowing login."""
    return {
        "min_apk_version": MIN_APK_VERSION,
        "update_url": os.environ.get("APK_UPDATE_URL") or None,
        "message": f"Please update to v{MIN_APK_VERSION} or later to continue.",
    }


@router.post("/api/auth/login")
async def login(body: LoginIn):
    username = normalize_username(body.username)
    user = await db.users.find_one({"username": username})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if user.get("is_active") is False:
        raise HTTPException(status_code=403, detail="Account deactivated. Contact admin.")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Enforce minimum APK version (web app skips this entirely)
    client = (body.client or "").strip().lower()
    app_version = (body.app_version or "").strip()
    if client == "apk":
        if not app_version or _version_tuple(app_version) < _version_tuple(MIN_APK_VERSION):
            raise HTTPException(
                status_code=426,
                detail=f"App version {app_version or 'unknown'} is too old. Please update to {MIN_APK_VERSION} or later.",
            )

    token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user["user_id"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": expires,
        "client": client or None,
        "app_version": app_version or None,
        "device_info": (body.device_info or "").strip() or None,
    })
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "last_login_at": datetime.now(timezone.utc),
            "last_client": client or "web",
            "last_app_version": app_version or None,
            "last_device_info": (body.device_info or "").strip() or None,
        }},
    )
    return {
        "session_token": token,
        "user": public_user({k: v for k, v in user.items() if k != "_id"}),
    }

@router.post("/api/auth/change-password")
async def change_password(body: ChangePasswordIn, current=Depends(get_current_user_from_request)):
    user = await db.users.find_one({"user_id": current["user_id"]})
    if not user or not verify_password(body.old_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_hash = hash_password(body.new_password)
    await db.users.update_one(
        {"user_id": current["user_id"]},
        {"$set": {"password_hash": new_hash, "password_changed_at": datetime.now(timezone.utc)}},
    )
    return {"success": True}

@router.get("/api/users")
async def list_users(current=Depends(get_current_user_from_request)):
    if current.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")
    out = []
    async for u in db.users.find({}, {"_id": 0, "password_hash": 0}).sort("name", 1):
        out.append(u)
    return out

@router.post("/api/users")
async def create_user(body: UserCreateIn, current=Depends(require_super_admin)):
    username = normalize_username(body.username)
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=409, detail="Username already exists")
    await assert_role_valid(body.role)
    user_id = f"u_{secrets.token_hex(8)}"
    doc = {
        "user_id": user_id,
        "username": username,
        "name": body.name.strip(),
        "email": (body.email or "").strip(),
        "role": body.role,
        "is_active": True,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc),
        "created_by": current["user_id"],
    }
    await db.users.insert_one(doc)
    return public_user({k: v for k, v in doc.items() if k != "_id"})

@router.put("/api/users/{user_id}")
async def update_user(user_id: str, body: UserUpdateIn, current=Depends(require_super_admin)):
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id == current["user_id"] and body.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    upd = {}
    if body.name is not None:
        upd["name"] = body.name.strip()
    if body.email is not None:
        upd["email"] = body.email.strip()
    if body.phone is not None:
        upd["phone"] = body.phone.strip()
    if body.username is not None:
        new_username = normalize_username(body.username)
        if new_username != user.get("username"):
            clash = await db.users.find_one({
                "username": new_username,
                "user_id": {"$ne": user_id},
            })
            if clash:
                raise HTTPException(status_code=409, detail=f"Username '{new_username}' is already taken")
            upd["username"] = new_username
    if body.role is not None:
        await assert_role_valid(body.role)
        # Prevent removing the last super_admin
        if user.get("role") == "super_admin" and body.role != "super_admin":
            count = await db.users.count_documents({"role": "super_admin", "is_active": {"$ne": False}})
            if count <= 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last super admin")
        upd["role"] = body.role
    if body.is_active is not None:
        upd["is_active"] = body.is_active
        if body.is_active is False:
            # invalidate all sessions for this user
            await db.user_sessions.delete_many({"user_id": user_id})
    if upd:
        upd["updated_at"] = datetime.now(timezone.utc)
        upd["updated_by"] = current["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": upd})
    return {"success": True, "updated": list(upd.keys())}

@router.post("/api/users/{user_id}/reset-password")
async def reset_password(user_id: str, body: ResetPasswordIn, current=Depends(require_super_admin)):
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_hash = hash_password(body.new_password)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"password_hash": new_hash, "password_reset_at": datetime.now(timezone.utc), "password_reset_by": current["user_id"]}},
    )
    await db.user_sessions.delete_many({"user_id": user_id})
    return {"success": True}


@router.get("/api/email/status")
async def email_status(current=Depends(get_current_user_from_request)):
    """Tells the frontend whether email features (auto-send, resend) are wired up."""
    from services.email_service import is_configured
    return {"configured": is_configured()}


@router.get("/api/whatsapp/status")
async def whatsapp_status(current=Depends(get_current_user_from_request)):
    from services.whatsapp_service import is_configured
    return {"configured": is_configured()}


class QuickActivateIn(BaseModel):
    username: str
    password: str
    role: str


@router.post("/api/users/{user_id}/quick-activate")
async def quick_activate(user_id: str, body: QuickActivateIn, current=Depends(require_super_admin)):
    """One-shot: assign username + password + role and activate the user.

    Used by the "Quick Activate" wizard so the admin doesn't have to
    bounce between three separate API calls (Edit -> Reset Password ->
    Activate). Validates uniqueness of the username and rejects on
    collision so the original record stays untouched.
    """
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_username = normalize_username(body.username)
    if not new_username:
        raise HTTPException(status_code=400, detail="Invalid username")

    # Uniqueness check (skip if user already owns this username)
    if new_username != user.get("username"):
        clash = await db.users.find_one({
            "username": new_username,
            "user_id": {"$ne": user_id},
        })
        if clash:
            raise HTTPException(status_code=409, detail=f"Username '{new_username}' is already taken")

    await assert_role_valid(body.role)
    new_hash = hash_password(body.password)

    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "username": new_username,
            "role": body.role,
            "is_active": True,
            "password_hash": new_hash,
            "password_reset_at": datetime.now(timezone.utc),
            "password_reset_by": current["user_id"],
            "activated_at": datetime.now(timezone.utc),
            "activated_by": current["user_id"],
            "updated_at": datetime.now(timezone.utc),
            "updated_by": current["user_id"],
        }, "$unset": {"deactivated_reason": "", "deactivated_at": ""}},
    )
    # Force-logout any existing sessions
    await db.user_sessions.delete_many({"user_id": user_id})

    # Best-effort credentials email — never blocks activation
    email_status = {"sent": False, "reason": "no_email_on_user"}
    try:
        if user.get("email"):
            from services.email_service import try_send_credentials_email
            email_status = await try_send_credentials_email(
                to_email=user["email"],
                name=user.get("name", new_username),
                username=new_username,
                password=body.password,
                role=body.role,
            )
    except Exception as e:
        email_status = {"sent": False, "reason": f"{type(e).__name__}: {e}"}

    # Best-effort credentials WhatsApp — never blocks activation
    whatsapp_status = {"sent": False, "reason": "no_phone_on_user"}
    try:
        if user.get("phone"):
            from services.whatsapp_service import try_send_credentials_whatsapp
            whatsapp_status = await try_send_credentials_whatsapp(
                to_phone=user["phone"],
                name=user.get("name", new_username),
                username=new_username,
                password=body.password,
                role=body.role,
            )
    except Exception as e:
        whatsapp_status = {"sent": False, "reason": f"{type(e).__name__}: {e}"}

    return {
        "success": True,
        "user_id": user_id,
        "username": new_username,
        "role": body.role,
        "email": email_status,
        "whatsapp": whatsapp_status,
        "message": f"User '{new_username}' is now active.",
    }


class SendCredsIn(BaseModel):
    password: str


@router.post("/api/users/{user_id}/send-credentials")
async def send_credentials_to_user(user_id: str, body: SendCredsIn, current=Depends(require_super_admin)):
    """Resend the credentials email. Admin must supply the password they
    want delivered (we don't store plaintext passwords). If supplying a
    new password also rotates the stored hash; pass the user's current
    password if you just want to resend without rotating.
    """
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.get("email"):
        raise HTTPException(status_code=400, detail="User has no email address on file")
    if not user.get("username"):
        raise HTTPException(status_code=400, detail="User has no username — activate first")

    # Rotate the hash to the password being sent so login matches what they receive
    new_hash = hash_password(body.password)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "password_hash": new_hash,
            "password_reset_at": datetime.now(timezone.utc),
            "password_reset_by": current["user_id"],
        }},
    )
    await db.user_sessions.delete_many({"user_id": user_id})

    from services.email_service import is_configured, try_send_credentials_email
    if not is_configured():
        raise HTTPException(status_code=503, detail="Email service is not configured. Set RESEND_API_KEY.")
    result = await try_send_credentials_email(
        to_email=user["email"],
        name=user.get("name", user["username"]),
        username=user["username"],
        password=body.password,
        role=user.get("role", "operator_vmc"),
    )
    if not result.get("sent"):
        raise HTTPException(status_code=502, detail=f"Email failed: {result.get('reason')}")
    return {"success": True, "email": result}


@router.post("/api/users/{user_id}/send-whatsapp")
async def send_whatsapp_to_user(user_id: str, body: SendCredsIn, current=Depends(require_super_admin)):
    """Resend credentials via WhatsApp. Admin supplies the password to deliver
    (we never store plaintext); the stored hash is rotated to match.
    """
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.get("phone"):
        raise HTTPException(status_code=400, detail="User has no phone number on file")
    if not user.get("username"):
        raise HTTPException(status_code=400, detail="User has no username — activate first")

    new_hash = hash_password(body.password)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "password_hash": new_hash,
            "password_reset_at": datetime.now(timezone.utc),
            "password_reset_by": current["user_id"],
        }},
    )
    await db.user_sessions.delete_many({"user_id": user_id})

    from services.whatsapp_service import is_configured, try_send_credentials_whatsapp
    if not is_configured():
        raise HTTPException(status_code=503, detail="WhatsApp service is not configured.")
    result = await try_send_credentials_whatsapp(
        to_phone=user["phone"],
        name=user.get("name", user["username"]),
        username=user["username"],
        password=body.password,
        role=user.get("role", "operator_vmc"),
    )
    if not result.get("sent"):
        raise HTTPException(status_code=502, detail=f"WhatsApp failed: {result.get('reason')}")
    return {"success": True, "whatsapp": result}

@router.delete("/api/users/{user_id}")
async def deactivate_user(user_id: str, current=Depends(require_super_admin)):
    if user_id == current["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"user_id": user_id}, {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc)}})
    await db.user_sessions.delete_many({"user_id": user_id})
    return {"success": True}

@router.get("/api/roles")
async def list_roles():
    return await get_all_roles()

@router.post("/api/roles")
async def add_role(body: RoleIn, current=Depends(require_super_admin)):
    name = body.name.strip().lower().replace(" ", "_")
    if name in DEFAULT_ROLES:
        return {"success": True, "name": name, "note": "Built-in role"}
    if await db.roles.find_one({"name": name}):
        return {"success": True, "name": name, "note": "Already exists"}
    await db.roles.insert_one({
        "name": name,
        "created_at": datetime.now(timezone.utc),
        "created_by": current["user_id"],
    })
    return {"success": True, "name": name}


# ─────────────────────────────────────────────────────────────
# Emergency super-admin reset.
# When the on-startup seeder is skipped (e.g. an existing admin user
# already has role super_admin with a forgotten password, or a stale
# DB has a partial parminder record), call this endpoint with the
# X-Reset-Key header to force-create-or-update the super_admin to the
# default credentials. Designed to be called once and ignored after.
# ─────────────────────────────────────────────────────────────
# Hardcoded so it always works even before any env var is set.
# Rotate after first use if you're worried.
RESET_SECRET = os.environ.get("SUPER_ADMIN_RESET_KEY", "vmc-emergency-reset-2026")


@router.post("/api/auth/_emergency_reset_super_admin")
@router.get("/api/auth/_emergency_reset_super_admin")
async def emergency_reset_super_admin(request: Request):
    """Force-create-or-reset the bootstrap super_admin.

    Auth: header `X-Reset-Key: <RESET_SECRET>` OR query param `?key=<RESET_SECRET>`.
    Body (optional JSON):
      { "username": "...", "password": "...", "name": "..." }
    Defaults: parminder / monty9694 / "Parminder Singh"
    """
    import logging
    log = logging.getLogger(__name__)
    try:
        # Accept key from header (POST) or query (GET, for easy browser testing)
        provided = request.headers.get("X-Reset-Key", "") or request.query_params.get("key", "")
        if not provided or provided != RESET_SECRET:
            raise HTTPException(status_code=403, detail="Invalid reset key")

        body = {}
        try:
            if request.method == "POST":
                # Tolerate empty body / non-JSON body
                raw = await request.body()
                if raw:
                    import json as _json
                    try:
                        body = _json.loads(raw)
                    except Exception:
                        body = {}
        except Exception:
            body = {}

        username = (body.get("username") or request.query_params.get("username") or "parminder").strip().lower()
        password = body.get("password") or request.query_params.get("password") or "monty9694"
        name = body.get("name") or request.query_params.get("name") or "Parminder Singh"

        # Hash password (will 400 if too short, but our defaults are safe)
        try:
            pw_hash = hash_password(password)
        except HTTPException:
            raise
        except Exception as he:
            log.exception("emergency_reset: hash_password failed")
            raise HTTPException(status_code=500, detail=f"hash error: {he}")

        existing = await db.users.find_one({"username": username})
        if existing:
            await db.users.update_one(
                {"user_id": existing["user_id"]},
                {"$set": {
                    "username": username,
                    "role": "super_admin",
                    "is_active": True,
                    "password_hash": pw_hash,
                    "name": name,
                    "reset_at": datetime.now(timezone.utc),
                }},
            )
            return {
                "success": True,
                "action": "updated",
                "user_id": existing["user_id"],
                "username": username,
                "message": f"Existing user '{username}' reset to super_admin with new password.",
            }

        user_id = f"u_{secrets.token_hex(8)}"
        await db.users.insert_one({
            "user_id": user_id,
            "username": username,
            "name": name,
            "email": "",
            "role": "super_admin",
            "is_active": True,
            "password_hash": pw_hash,
            "created_at": datetime.now(timezone.utc),
            "reset_at": datetime.now(timezone.utc),
            "created_by": "emergency_reset",
        })
        return {
            "success": True,
            "action": "created",
            "user_id": user_id,
            "username": username,
            "message": f"New super_admin '{username}' created.",
        }
    except HTTPException:
        raise
    except Exception as e:
        # Log full traceback to backend logs and return JSON detail instead of bare 500
        import traceback
        tb = traceback.format_exc()
        log.error(f"emergency_reset_super_admin crash: {e}\n{tb}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


# ─────────────────────────────────────────────────────────────
# Bootstrap seed: ensure at least one super_admin exists.
# Idempotent — safe to call on every startup. Picks credentials
# from env vars so production rotation is possible without code change.
# ─────────────────────────────────────────────────────────────
async def ensure_super_admin_seeded():
    """Create the bootstrap super_admin user if none exists yet.

    Reads SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME
    from env. Falls back to safe defaults so first-boot production gets
    a working login out of the box.
    """
    import logging
    log = logging.getLogger(__name__)
    try:
        existing = await db.users.count_documents({
            "role": "super_admin",
            "is_active": {"$ne": False},
        })
        if existing > 0:
            return  # already seeded

        username = (os.environ.get("SUPER_ADMIN_USERNAME") or "parminder").strip().lower()
        password = os.environ.get("SUPER_ADMIN_PASSWORD") or "monty9694"
        name = os.environ.get("SUPER_ADMIN_NAME") or "Parminder Singh"

        # If a (likely deactivated) user with this username already exists,
        # just reactivate + reset rather than fail on the unique key.
        same = await db.users.find_one({"username": username})
        if same:
            await db.users.update_one(
                {"user_id": same["user_id"]},
                {"$set": {
                    "role": "super_admin",
                    "is_active": True,
                    "password_hash": hash_password(password),
                    "name": name,
                    "seeded_at": datetime.now(timezone.utc),
                }},
            )
            log.info(f"[seed] reactivated existing super_admin: {username}")
            return

        user_id = f"u_{secrets.token_hex(8)}"
        await db.users.insert_one({
            "user_id": user_id,
            "username": username,
            "name": name,
            "email": "",
            "role": "super_admin",
            "is_active": True,
            "password_hash": hash_password(password),
            "created_at": datetime.now(timezone.utc),
            "seeded_at": datetime.now(timezone.utc),
            "created_by": "system",
        })
        log.info(f"[seed] created bootstrap super_admin: {username}")
    except Exception as e:
        log.error(f"[seed] failed to seed super_admin: {e}")


async def deactivate_users_without_username():
    """Force-deactivate any user that doesn't have a real username assigned.

    Rule: a user must have BOTH (a) a non-empty `username` AND (b) a
    `password_hash` set, before they can be active. This auto-runs on
    startup and immediately gates the 44 legacy Google-OAuth users until
    the super_admin manually assigns each one a username + password via
    the Manage Users page.

    NEVER deactivates super_admins (so we don't lock ourselves out).
    """
    import logging
    log = logging.getLogger(__name__)
    try:
        result = await db.users.update_many(
            {
                "role": {"$ne": "super_admin"},
                "is_active": {"$ne": False},
                "$or": [
                    {"username": {"$exists": False}},
                    {"username": None},
                    {"username": ""},
                    {"password_hash": {"$exists": False}},
                    {"password_hash": None},
                    {"password_hash": ""},
                ],
            },
            {"$set": {
                "is_active": False,
                "deactivated_reason": "no_username_assigned",
                "deactivated_at": datetime.now(timezone.utc),
            }},
        )
        if result.modified_count > 0:
            log.info(f"[startup] Deactivated {result.modified_count} users without username/password")
    except Exception as e:
        log.error(f"[startup] deactivate_users_without_username failed: {e}")
