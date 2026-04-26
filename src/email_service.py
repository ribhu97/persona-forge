import os
import resend
from typing import Optional

resend.api_key = os.environ.get("RESEND_API_KEY")

def send_otp_email(to_email: str, otp_code: str) -> None:
    """
    Send an OTP email using Resend.
    Raises RuntimeError if RESEND_API_KEY is not configured or sending fails.
    """
    if not resend.api_key:
        raise RuntimeError("RESEND_API_KEY is not configured")

    params = {
        "from": "onboarding@resend.dev",
        "to": [to_email],
        "subject": "Your Login OTP",
        "html": f"<p>Your OTP code is: <strong>{otp_code}</strong></p>",
    }

    try:
        resend.Emails.send(params)
    except Exception as e:
        raise RuntimeError(f"Failed to send OTP email: {e}") from e
