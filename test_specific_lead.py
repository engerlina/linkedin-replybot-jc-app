"""
Test connection request on a specific fresh lead
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
        token = resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get all leads
        resp = await client.get(f"{BASE_URL}/api/leads", headers=headers)
        leads = resp.json()

        # Find Erika Hou
        test_lead = next((l for l in leads if "Erika Hou" in l.get("name", "")), None)

        if not test_lead:
            print("Lead not found!")
            return

        print(f"Testing: {test_lead['name']}")
        print(f"URL: {test_lead['linkedInUrl']}")
        print(f"Connection Status: {test_lead.get('connectionStatus')}")
        print(f"Connection Sent At: {test_lead.get('connectionSentAt')}")

        # Call debug endpoint
        print("\nCalling debug-connection endpoint...")

        resp = await client.post(
            f"{BASE_URL}/api/leads/{test_lead['id']}/debug-connection",
            headers=headers
        )

        result = resp.json()

        print(f"\nAPI Success: {result.get('success')}")
        print(f"Member URN: {result.get('member_urn')}")

        print("\n--- Method Results ---")
        for method in result.get('method_results', []):
            print(f"\nMethod: {method.get('method')}")
            print(f"  Status: {method.get('status')}")
            if method.get('error'):
                print(f"  Error: {method.get('error')}")
            if method.get('response'):
                resp_data = method.get('response')
                status_code = resp_data.get('data', {}).get('status')
                print(f"  LinkedIn Status Code: {status_code}")

                # Interpret status codes
                if status_code == 200:
                    print("  >> INTERPRETATION: New connection request sent successfully!")
                elif status_code == 301:
                    print("  >> INTERPRETATION: Connection request ALREADY PENDING (sent before)")
                elif status_code == 403:
                    print("  >> INTERPRETATION: Cannot send connection (blocked or restricted)")
                else:
                    print(f"  >> INTERPRETATION: Unknown status code")

if __name__ == "__main__":
    asyncio.run(main())
