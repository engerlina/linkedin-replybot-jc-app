"""
Test browser-based connection request
"""
import httpx
import asyncio
import sys

BASE_URL = "https://linkedin-replybot-jc-app-production.up.railway.app"

async def main():
    # Get lead_id from command line or use first available lead
    lead_id = sys.argv[1] if len(sys.argv) > 1 else None

    async with httpx.AsyncClient(timeout=300.0) as client:
        print("Logging in...")
        resp = await client.post(
            f"{BASE_URL}/api/auth/login",
            json={"password": "5Hot5seeme!"}
        )
        token = resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        if not lead_id:
            # Get a lead that's not connected
            print("\nFetching a lead to test with...")
            resp = await client.get(
                f"{BASE_URL}/api/leads?connectionStatus=notConnected&limit=1",
                headers=headers
            )
            leads = resp.json()
            if not leads:
                # Try pending
                resp = await client.get(
                    f"{BASE_URL}/api/leads?connectionStatus=pending&limit=1",
                    headers=headers
                )
                leads = resp.json()

            if not leads:
                print("No leads found to test with!")
                return

            lead_id = leads[0]["id"]
            print(f"Using lead: {leads[0]['name']} ({leads[0].get('linkedInUrl', 'No URL')})")

        # Call the browser-connect endpoint
        print(f"\n=== Testing Browser Connection for lead {lead_id} ===")
        print("This may take up to 3 minutes...")

        resp = await client.post(
            f"{BASE_URL}/api/leads/{lead_id}/browser-connect",
            headers=headers,
            timeout=300.0
        )

        if resp.status_code != 200:
            print(f"Error {resp.status_code}: {resp.text}")
            return

        result = resp.json()

        print(f"\n=== Result ===")
        print(f"Success: {result.get('success')}")
        print(f"Message: {result.get('message')}")
        print(f"Status: {result.get('status')}")

        print(f"\n=== Debug Log ===")
        for line in result.get('debug_log', []):
            print(f"  {line}")

        if result.get('lead'):
            lead = result['lead']
            print(f"\n=== Updated Lead ===")
            print(f"  Name: {lead.get('name')}")
            print(f"  Connection Status: {lead.get('connectionStatus')}")
            print(f"  Connection Sent At: {lead.get('connectionSentAt')}")


if __name__ == "__main__":
    asyncio.run(main())
