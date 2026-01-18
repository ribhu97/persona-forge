from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from datetime import datetime, timezone
import razorpay
import os
import hmac
import hashlib
from pydantic import BaseModel
from typing import Optional

from ..database import get_session
from ..models import User, Payment
from ..dependencies import get_current_user

router = APIRouter(prefix="/payments", tags=["payments"])

# Initialize Razorpay client
# Note: In production, use environment variables
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
    print("Warning: Razorpay keys not found in environment variables")

client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

class OrderCreate(BaseModel):
    amount: float # In INR
    currency: str = "INR"
    plan_type: str # plus, pro, lifetime

class PaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_type: str

@router.post("/create-order")
async def create_order(
    order_data: OrderCreate,
    current_user: User = Depends(get_current_user), # We need to import authentication dependency
    session: Session = Depends(get_session)
):
    try:
        # Amount in paise
        amount_paise = int(order_data.amount * 100)
        
        data = {
            "amount": amount_paise,
            "currency": order_data.currency,
            "receipt": f"receipt_{current_user.id}_{int(datetime.now().timestamp())}",
            "notes": {
                "user_id": str(current_user.id),
                "plan_type": order_data.plan_type
            }
        }
        
        order = client.order.create(data=data)
        
        # Save pending payment to DB
        payment = Payment(
            user_id=current_user.id,
            razorpay_order_id=order['id'],
            amount=order_data.amount,
            currency=order_data.currency,
            status="created"
        )
        session.add(payment)
        session.commit()
        
        return {
            "order_id": order['id'],
            "amount": order['amount'],
            "currency": order['currency'],
            "key_id": RAZORPAY_KEY_ID
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify-payment")
async def verify_payment(
    verify_data: PaymentVerify,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    try:
        # Verify signature
        params_dict = {
            'razorpay_order_id': verify_data.razorpay_order_id,
            'razorpay_payment_id': verify_data.razorpay_payment_id,
            'razorpay_signature': verify_data.razorpay_signature
        }
        
        client.utility.verify_payment_signature(params_dict)
        
        # Update payment status
        statement = select(Payment).where(Payment.razorpay_order_id == verify_data.razorpay_order_id)
        results = session.exec(statement)
        payment = results.first()
        
        if payment:
            payment.razorpay_payment_id = verify_data.razorpay_payment_id
            payment.status = "paid"
            session.add(payment)
        
        # Update user account type
        # 0=Free, 1=Plus, 2=Pro, 3=Lifetime
        new_account_type = 0
        if verify_data.plan_type == "plus":
            new_account_type = 1
        elif verify_data.plan_type == "pro":
            new_account_type = 2
        elif verify_data.plan_type == "lifetime":
            new_account_type = 1 # Lifetime is technically Plus features forever
        
        # For lifetime, we could have a specific flag or type, but here we'll use subscription_active=True
        # and maybe a far future expiry
        
        current_user.account_type = new_account_type
        current_user.subscription_active = True
        
        # Set expiry
        # Simple logic: 30 days for monthly, 100 years for lifetime
        if verify_data.plan_type == "lifetime":
            current_user.subscription_expires_at = datetime(2125, 1, 1, tzinfo=timezone.utc)
        else:
            # Add 30 days
            # real implementation would calculate from now + 30 days
             from datetime import timedelta
             current_user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
             
        session.add(current_user)
        session.commit()
        
        return {"status": "success", "message": "Payment verified and subscription activated"}
        
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
