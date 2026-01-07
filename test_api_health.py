"""
Test LinkedIn API health - check if basic operations work
"""
import httpx
import asyncio
import json

BASE_URL = "https://linkedin-replybot-jc-app-production.up.railway.app"

async def main():
    async with httpx.AsyncClient(timeout=90.0) as client:
        print("Logging in...")
        resp = await client.post(
            f"{BASE_URL}/api/auth/login",
            json={"password": "5Hot5seeme!"}
        )
        token = resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get a lead to test with
        resp = await client.get(f"{BASE_URL}/api/leads?limit=1", headers=headers)
        leads = resp.json()
        if not leads:
            print("No leads found!")
            return

        lead = leads[0]
        print(f"Testing with lead: {lead['name']}")
        print(f"Lead ID: {lead['id']}")

        # Call debug-connection to test the full flow
        print("\n=== Testing Connection Request Debug ===")
        resp = await client.post(
            f"{BASE_URL}/api/leads/{lead['id']}/debug-connection",
            headers=headers
        )

        if resp.status_code != 200:
            print(f"Error {resp.status_code}: {resp.text}")
            return

        result = resp.json()

        print(f"Success: {result.get('success')}")
        print(f"Member URN: {result.get('member_urn')}")

        print("\n--- Debug Log ---")
        for line in result.get('debug_log', []):
            print(f"  {line}")

        print("\n--- Method Results ---")
        for method in result.get('method_results', []):
            print(f"\nMethod: {method.get('method')}")
            print(f"  Status: {method.get('status')}")
            if method.get('error'):
                print(f"  Error: {method.get('error')}")
            if method.get('response'):
                # Parse the response to understand what's happening
                resp_data = method.get('response')
                print(f"  Response keys: {list(resp_data.keys()) if isinstance(resp_data, dict) else 'N/A'}")
                if isinstance(resp_data, dict):
                    data = resp_data.get('data', {})
                    if isinstance(data, dict):
                        status = data.get('status')
                        print(f"  LinkedIn Status: {status}")
                        if status == 301:
                            print("  >> This means 'Already Pending' but we found 0 sent invitations!")
                            print("  >> Something is wrong - the API says pending but LinkedIn shows nothing")

if __name__ == "__main__":
    asyncio.run(main())
