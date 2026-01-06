"""
Test connection request functionality
"""
import httpx
import asyncio

BASE_URL = "https://linkedin-replybot-jc-app-production.up.railway.app"

async def main():
    async with httpx.AsyncClient() as client:
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

        # Get all leads and find ones with connection status
        print("\nFetching leads...")
        resp = await client.get(f"{BASE_URL}/api/leads", headers=headers)
        leads = resp.json()

        # Count by connection status
        status_counts = {}
        for lead in leads:
            status = lead.get("connectionStatus", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1

        print(f"\nLead connection statuses:")
        for status, count in sorted(status_counts.items()):
            print(f"  {status}: {count}")

        # Find leads that were supposed to have connection sent
        print("\nLeads with pending connections (connection sent but not yet accepted):")
        pending = [l for l in leads if l.get("connectionStatus") == "pending"]
        for lead in pending[:10]:
            print(f"  - {lead['name']} ({lead['linkedInUrl']})")
            if lead.get("connectionSentAt"):
                print(f"    Sent at: {lead['connectionSentAt']}")

        # Check activity logs for connection attempts
        print("\n\nFetching activity logs...")
        resp = await client.get(f"{BASE_URL}/api/activity", headers=headers)
        if resp.status_code == 200:
            activities = resp.json()
            connection_activities = [a for a in activities if "connection" in a.get("action", "").lower()]
            print(f"\nConnection-related activities: {len(connection_activities)}")
            for act in connection_activities[:10]:
                print(f"  {act.get('createdAt')}: {act.get('action')} - {act.get('status')}")
                if act.get("details"):
                    print(f"    Details: {act.get('details')}")
        else:
            print(f"Failed to get activity: {resp.status_code}")

        # Now let's test a direct connection request to see what happens
        print("\n\n=== Testing Direct Connection API ===")
        # Get accounts
        resp = await client.get(f"{BASE_URL}/api/accounts", headers=headers)
        accounts = resp.json()

        if not accounts:
            print("No accounts found!")
            return

        account = accounts[0]
        print(f"Using account: {account['name']} (ID: {account['id']})")

        # Test with a sample profile - let's pick one of the leads that shows as notConnected
        not_connected = [l for l in leads if l.get("connectionStatus") == "notConnected"]
        if not_connected:
            test_lead = not_connected[0]
            print(f"\nTesting connection request to: {test_lead['name']}")
            print(f"LinkedIn URL: {test_lead['linkedInUrl']}")

            # Call the test connection endpoint if it exists, or we can check the lead endpoint
            # For now just report what we found
            print("\nTo actually test, check the backend logs when a connection request is made.")
        else:
            print("\nNo 'notConnected' leads to test with")

if __name__ == "__main__":
    asyncio.run(main())
