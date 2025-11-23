import time
from fastapi.testclient import TestClient

def test_health(client: TestClient):
    """Test the health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "persona-generator"}

def test_signup(client: TestClient):
    """Test the user signup flow"""
    email = f"test_{int(time.time())}@example.com"
    payload = {
        "email": email,
        "password": "password123",
        "name": "Test User"
    }
    
    response = client.post("/auth/signup", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "User created. Please verify your email with the OTP sent."
