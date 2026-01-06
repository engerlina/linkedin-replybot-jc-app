"""
Test connection request on a lead that hasn't been contacted yet
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

        # Get all leads
        print("\nFetching leads...")
        resp = await client.get(f"{BASE_URL}/api/leads", headers=headers)
        leads = resp.json()

        # Find notConnected leads WITHOUT connectionSentAt (never been contacted)
        fresh_leads = [
            l for l in leads
            if l.get("connectionStatus") == "notConnected"
            and not l.get("connectionSentAt")
        ]

        print(f"\nFound {len(fresh_leads)} fresh 'notConnected' leads (no connection request sent)")

        if fresh_leads:
            print("\nFirst 5 fresh leads:")
            for lead in fresh_leads[:5]:
                print(f"  - {lead['name']} ({lead['linkedInUrl']})")

            # Test with first one
            test_lead = fresh_leads[0]
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
            print(f"Member URN: {result.get('member_urn')}")

            print("\n--- Method Results ---")
            for method in result.get('method_results', []):
                print(f"\nMethod: {method.get('method')}")
                print(f"  Status: {method.get('status')}")
                if method.get('error'):
                    print(f"  Error: {method.get('error')}")
                if method.get('response'):
                    resp_str = json.dumps(method.get('response'), indent=2, default=str)
                    print(f"  Response: {resp_str}")
        else:
            print("\nNo fresh leads to test with. All notConnected leads have been contacted.")

            # Let's also check leads that are marked "pending"
            pending = [l for l in leads if l.get("connectionStatus") == "pending"]
            print(f"\n{len(pending)} leads have 'pending' status")
            print("These are people you've already sent connection requests to.")
            print("\nTo verify connection requests are working:")
            print("1. Log into LinkedIn and check your 'Sent' invitations")
            print("2. Search for one of the pending leads by name")

            if pending:
                print("\nPending leads (check these on LinkedIn):")
                for lead in pending[:5]:
                    print(f"  - {lead['name']}")

if __name__ == "__main__":
    asyncio.run(main())
