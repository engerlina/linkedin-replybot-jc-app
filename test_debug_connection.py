"""
Test the debug-connection endpoint to see what's happening with LinkedIn API
"""
import httpx
import asyncio
import json

BASE_URL = "https://linkedin-replybot-jc-app-production.up.railway.app"

async def main():
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Login first
        print("Logging in...")
        resp = await client.post(
            f"{BASE_URL}/api/auth/login",
            json={"password": "5Hot5seeme!"}
        )
        if resp.status_code != 200:
            print(f"Login failed: {resp.text}")
            return

        token = resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get all leads and find one that's notConnected
        print("\nFetching leads...")
        resp = await client.get(f"{BASE_URL}/api/leads", headers=headers)
        leads = resp.json()

        # Find a notConnected lead to test with
        not_connected = [l for l in leads if l.get("connectionStatus") == "notConnected"]

        if not not_connected:
            print("No 'notConnected' leads to test with!")
            return

        # Pick first one
        test_lead = not_connected[0]
        print(f"\nTesting connection request to:")
        print(f"  Name: {test_lead['name']}")
        print(f"  LinkedIn URL: {test_lead['linkedInUrl']}")
        print(f"  Lead ID: {test_lead['id']}")

        # Call debug endpoint
        print("\n" + "="*60)
        print("Calling debug-connection endpoint...")
        print("="*60)

        resp = await client.post(
            f"{BASE_URL}/api/leads/{test_lead['id']}/debug-connection",
            headers=headers
        )

        if resp.status_code != 200:
            print(f"Request failed with status {resp.status_code}")
            print(f"Response: {resp.text}")
            return

        result = resp.json()

        print(f"\nSuccess: {result.get('success')}")
        print(f"Lead: {result.get('lead_name')}")
        print(f"Profile URL: {result.get('profile_url')}")
        print(f"Member URN: {result.get('member_urn')}")

        print("\n--- Debug Log ---")
        for line in result.get('debug_log', []):
            print(line)

        print("\n--- Method Results ---")
        for method in result.get('method_results', []):
            print(f"\nMethod: {method.get('method')}")
            print(f"  Status: {method.get('status')}")
            if method.get('error'):
                print(f"  Error: {method.get('error')}")
            if method.get('response'):
                print(f"  Response: {json.dumps(method.get('response'), indent=2, default=str)[:500]}")

if __name__ == "__main__":
    asyncio.run(main())
