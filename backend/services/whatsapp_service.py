"""WhatsApp delivery via Twilio.

Used to send login credentials (and future operational notifications)
to operators on WhatsApp. Designed to fail SOFT — failure to deliver
never blocks the activation flow.

Required env vars:
  TWILIO_ACCOUNT_SID   – starts with AC...
  TWILIO_AUTH_TOKEN    – 32-char hex
  TWILIO_WHATSAPP_FROM – sandbox: 'whatsapp:+14155238886'
                         production: 'whatsapp:+<your-business-number>'
  APP_PUBLIC_URL       – used in the message body link

Sandbox notes:
  - Recipients MUST first send 'join <keyword>' to +1 415 523 8886
    from their phone to opt in to your sandbox. Otherwise messages
    silently fail with a 63007 / 63016 error from Twilio.
  - In production (registered sender), no opt-in is needed but
    outbound business-initiated messages must use an approved
    template. Until then we use the free-form sandbox flow.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Optional

from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

log = logging.getLogger(__name__)


def _sid() -> Optional[str]:
    return os.environ.get("TWILIO_ACCOUNT_SID")


def _token() -> Optional[str]:
    return os.environ.get("TWILIO_AUTH_TOKEN")


def _from() -> Optional[str]:
    return os.environ.get("TWILIO_WHATSAPP_FROM")


def _app_url() -> str:
    return os.environ.get("APP_PUBLIC_URL") or "https://entry-manager-28.emergent.host"


def is_configured() -> bool:
    return bool(_sid() and _token() and _from())


def _normalize_to(raw: str) -> str:
    """Normalize a phone number to E.164 with a 'whatsapp:' prefix.

    Accepts:
      "+919876543210", "919876543210", "9876543210" (assumes +91),
      "whatsapp:+919876543210" (passthrough).
    """
    if not raw:
        return ""
    s = raw.strip()
    if s.lower().startswith("whatsapp:"):
        return s
    digits = re.sub(r"[^\d+]", "", s)
    if digits.startswith("+"):
        return f"whatsapp:{digits}"
    if len(digits) == 10:
        # Assume India by default (most operators here)
        return f"whatsapp:+91{digits}"
    return f"whatsapp:+{digits}"


def _credentials_text(*, name: str, username: str, password: str, role: str) -> str:
    url = _app_url()
    return (
        f"Hi {name or 'there'},\n\n"
        "*VMC Job Shop* — your account is now active.\n\n"
        f"*Username:* `{username}`\n"
        f"*Password:* `{password}`\n"
        f"*Role:* {role}\n\n"
        f"Log in: {url}\n\n"
        "Please change your password after first login.\n"
        "_If you didn't expect this message, contact your administrator._"
    )


async def send_whatsapp(*, to_phone: str, body: str) -> dict:
    """Send a free-form WhatsApp message via Twilio. Raises on failure."""
    if not is_configured():
        raise RuntimeError("Twilio WhatsApp is not configured")
    to = _normalize_to(to_phone)
    if not to:
        raise ValueError("invalid recipient phone")
    client = Client(_sid(), _token())
    # SDK is sync — use a thread so we stay non-blocking
    msg = await asyncio.to_thread(
        client.messages.create,
        from_=_from(),
        to=to,
        body=body,
    )
    return {"sid": msg.sid, "status": msg.status, "to": to}


async def send_credentials_whatsapp(
    *,
    to_phone: str,
    name: str,
    username: str,
    password: str,
    role: str,
) -> dict:
    body = _credentials_text(name=name, username=username, password=password, role=role)
    return await send_whatsapp(to_phone=to_phone, body=body)


async def try_send_credentials_whatsapp(**kwargs) -> dict:
    """Best-effort: never raises. Returns {sent: bool, reason?, sid?}."""
    if not is_configured():
        return {"sent": False, "reason": "whatsapp_not_configured"}
    if not kwargs.get("to_phone"):
        return {"sent": False, "reason": "no_phone_on_user"}
    try:
        result = await send_credentials_whatsapp(**kwargs)
        return {"sent": True, **result}
    except TwilioRestException as e:
        # Twilio gives a human code (e.g. 63007 = recipient not in sandbox)
        log.warning(f"twilio error sending whatsapp: {e.code} {e.msg}")
        return {"sent": False, "reason": f"twilio_{e.code}: {e.msg}"}
    except Exception as e:
        log.warning(f"send_credentials_whatsapp failed: {e}")
        return {"sent": False, "reason": f"{type(e).__name__}: {e}"}
