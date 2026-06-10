"""Transactional email service via Resend.

Used by the user-activation flow to deliver login credentials to operators
the moment a super_admin activates their account. Designed to fail SOFT —
if the email can't go out (missing API key, Resend down, bad recipient),
the activation itself still succeeds and the admin sees a small toast.

Required env vars:
  RESEND_API_KEY  – API key from https://resend.com/api-keys (re_...)
  SENDER_EMAIL    – default from address. For zero-DNS testing use
                    onboarding@resend.dev (Resend's free test sender).
  APP_PUBLIC_URL  – optional, link shown in the credentials email
                    (e.g. https://entry-manager-28.emergent.host).
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import resend

log = logging.getLogger(__name__)


def _api_key() -> Optional[str]:
    return os.environ.get("RESEND_API_KEY")


def _sender() -> str:
    return os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev"


def is_configured() -> bool:
    return bool(_api_key())


def app_url() -> str:
    return os.environ.get("APP_PUBLIC_URL") or "https://entry-manager-28.emergent.host"


async def send_html_email(
    *,
    to_email: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> dict:
    """Send a transactional HTML email. Raises if not configured."""
    key = _api_key()
    if not key:
        raise RuntimeError("RESEND_API_KEY not set")
    resend.api_key = key

    params = {
        "from": _sender(),
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    if text:
        params["text"] = text

    # Resend SDK is sync — push to a thread so we stay non-blocking
    result = await asyncio.to_thread(resend.Emails.send, params)
    return result or {}


def _credentials_html(*, name: str, username: str, password: str, role: str) -> str:
    """Inline-CSS, table-based, broadly compatible credentials email."""
    url = app_url()
    safe_name = (name or "there").strip()
    return f"""\
<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e6ea;">
    <tr>
      <td style="background:#0f172a;padding:18px 24px;color:#fff;">
        <div style="font-size:18px;font-weight:700;letter-spacing:0.3px;">VMC Job Shop</div>
        <div style="font-size:12px;opacity:0.8;margin-top:2px;">Account activated</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 12px 0;font-size:15px;">Hi <strong>{safe_name}</strong>,</p>
        <p style="margin:0 0 16px 0;font-size:14px;line-height:1.55;">
          Your account has been activated. You can now log in to the VMC Job Shop app
          using the credentials below.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin:8px 0 18px 0;">
          <tr>
            <td style="padding:14px 16px;">
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;">Username</div>
              <div style="font-size:16px;font-family:Consolas,Menlo,monospace;color:#0f172a;font-weight:700;margin-top:2px;">{username}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 16px 14px 16px;">
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;">Temporary Password</div>
              <div style="font-size:16px;font-family:Consolas,Menlo,monospace;color:#0f172a;font-weight:700;margin-top:2px;">{password}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 16px 14px 16px;">
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;">Role</div>
              <div style="font-size:14px;color:#0f172a;margin-top:2px;">{role}</div>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.55;">
          Open <a href="{url}" style="color:#2563eb;text-decoration:none;font-weight:600;">{url}</a> in your browser, or download the mobile app from the link your administrator shared.
        </p>
        <p style="margin:0 0 8px 0;font-size:13px;color:#475569;line-height:1.5;">
          For security, change your password the first time you sign in.
          If you didn't expect this email, contact your administrator.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background:#f8fafc;padding:14px 24px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;">
        VMC Job Shop · Automated message. Please do not reply.
      </td>
    </tr>
  </table>
</body></html>
"""


def _credentials_text(*, name: str, username: str, password: str, role: str) -> str:
    return (
        f"Hi {name or 'there'},\n\n"
        "Your VMC Job Shop account has been activated.\n\n"
        f"Username : {username}\n"
        f"Password : {password}\n"
        f"Role     : {role}\n\n"
        f"Log in: {app_url()}\n\n"
        "For security, change your password the first time you sign in.\n\n"
        "— VMC Job Shop"
    )


async def send_credentials_email(
    *,
    to_email: str,
    name: str,
    username: str,
    password: str,
    role: str,
) -> dict:
    """High-level wrapper: send a credentials email. Returns Resend response."""
    if not to_email or "@" not in to_email:
        raise ValueError("invalid recipient email")
    html = _credentials_html(name=name, username=username, password=password, role=role)
    text = _credentials_text(name=name, username=username, password=password, role=role)
    return await send_html_email(
        to_email=to_email,
        subject="Your VMC Job Shop login credentials",
        html=html,
        text=text,
    )


async def try_send_credentials_email(**kwargs) -> dict:
    """Best-effort: never raises. Returns {sent: bool, reason?: str, id?: str}."""
    if not is_configured():
        return {"sent": False, "reason": "email_not_configured"}
    try:
        result = await send_credentials_email(**kwargs)
        return {"sent": True, "id": result.get("id"), "to": kwargs.get("to_email")}
    except Exception as e:
        log.warning(f"send_credentials_email failed: {e}")
        return {"sent": False, "reason": f"{type(e).__name__}: {e}"}
