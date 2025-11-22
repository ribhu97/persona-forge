import requests
import time

BASE_URL = "http://localhost:8000"

def test_signup():
    print("Testing Signup...")
    email = f"test_{int(time.time())}@example.com"
    resp = requests.post(f"{BASE_URL}/auth/signup", json={
        "email": email,
        "password": "password123",
        "name": "Test User"
    })
    print(f"Signup Status: {resp.status_code}")
    print(f"Signup Response: {resp.json()}")
    return email

def test_health():
    print("Testing Health...")
    try:
        resp = requests.get(f"{BASE_URL}/health")
        print(f"Health: {resp.json()}")
    except Exception as e:
        print(f"Health Check Failed: {e}")

if __name__ == "__main__":
    # Wait for server to start
    time.sleep(2)
    try:
        test_health()
        email = test_signup()
    except Exception as e:
        print(f"Test failed: {e}")
