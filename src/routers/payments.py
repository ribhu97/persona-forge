from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from datetime import datetime, timezone, timedelta
import razorpay
import os
import hmac
import hashlib
from pydantic import BaseModel, ConfigDict
from typing import Optional

from ..database import get_session
from ..models import User, Payment
from ..dependencies import get_current_user

router = APIRouter(prefix="/payments", tags=["payments"])

# Initialize Razorpay client
# Note: In production, use environment variables
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

PLAN_PRICES: dict[str, float] = {
    "plus": 799.0,
    "pro": 1499.0,
    "lifetime": 4999.0,
}

def get_razorpay_client():
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Razorpay keys are not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
        )
    return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    currency: str = "INR"
    plan_type: str  # plus, pro, lifetime

class PaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

@router.post("/create-order")
async def create_order(
    order_data: OrderCreate,
    current_user: User = Depends(get_current_user), # We need to import authentication dependency
    session: Session = Depends(get_session)
):
    if order_data.plan_type not in PLAN_PRICES:
        raise HTTPException(status_code=400, detail=f"Unknown plan type: {order_data.plan_type}")

    try:
        amount = PLAN_PRICES[order_data.plan_type]
        # Amount in paise
        amount_paise = int(amount * 100)

        data = {
            "amount": amount_paise,
            "currency": order_data.currency,
            "receipt": f"receipt_{current_user.id}_{int(datetime.now().timestamp())}",
            "notes": {
                "user_id": str(current_user.id),
                "plan_type": order_data.plan_type
            }
        }

        client = get_razorpay_client()
        order = client.order.create(data=data)

        # Save pending payment to DB — plan_type is the authoritative record for upgrades
        payment = Payment(
            user_id=current_user.id,
            razorpay_order_id=order['id'],
            amount=amount,
            currency=order_data.currency,
            plan_type=order_data.plan_type,
            status="created"
        )
        session.add(payment)
        session.commit()

        return {
            "order_id": order['id'],
            "amount": order['amount'],
            "currency": order['currency'],
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating payment order: {e}")
        raise HTTPException(status_code=500, detail="Payment order creation failed. Please try again.")

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
        
        client = get_razorpay_client()
        client.utility.verify_payment_signature(params_dict)
        
        # Update payment status
        statement = select(Payment).where(
            Payment.razorpay_order_id == verify_data.razorpay_order_id,
            Payment.user_id == current_user.id,
        )
        payment = session.exec(statement).first()

        if not payment:
            raise HTTPException(status_code=404, detail="Order not found")

        payment.razorpay_payment_id = verify_data.razorpay_payment_id
        payment.status = "paid"
        session.add(payment)

        # Read plan_type from the stored order — never trust the client-submitted value
        plan_type = payment.plan_type
        if not plan_type:
            raise HTTPException(status_code=400, detail="Order has no plan_type recorded")

        # Update user account type
        # 0=Free, 1=Plus, 2=Pro — lifetime gets Pro-level access indefinitely
        if plan_type == "plus":
            new_account_type = 1
        elif plan_type in ("pro", "lifetime"):
            new_account_type = 2
        else:
            raise HTTPException(status_code=400, detail=f"Unknown plan type: {plan_type}")

        current_user.account_type = new_account_type
        current_user.subscription_active = True

        if plan_type == "lifetime":
            current_user.subscription_expires_at = datetime(2125, 1, 1, tzinfo=timezone.utc)
        else:
            current_user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
             
        session.add(current_user)
        session.commit()
        
        return {"status": "success", "message": "Payment verified and subscription activated"}
        
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except HTTPException:
        raise  # preserve 4xx errors we raised intentionally
    except Exception as e:
        print(f"Error verifying payment: {e}")
        raise HTTPException(status_code=500, detail="Payment verification failed. Please try again.")
