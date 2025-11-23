import os
import resend
from typing import Optional

resend.api_key = os.environ.get("RESEND_API_KEY")

def send_otp_email(to_email: str, otp_code: str) -> bool:
    """
    Send an OTP email using Resend.
    If RESEND_API_KEY is not set, prints the OTP to the console (for dev).
    """
    try:
        if not resend.api_key:
            print("WARNING: RESEND_API_KEY not found. Printing OTP to console.")
            print(f"OTP for {to_email}: {otp_code}")
            return True
            
        params = {
            "from": "onboarding@resend.dev",
            "to": [to_email],
            "subject": "Your Login OTP",
            "html": f"<p>Your OTP code is: <strong>{otp_code}</strong></p>",
        }
        
        email = resend.Emails.send(params)
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False
