"""
Fetch actual sent invitations from LinkedIn to verify connection requests
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

        # Call the sent invitations endpoint
        print("\nFetching actual sent invitations from LinkedIn...")
        resp = await client.get(
            f"{BASE_URL}/api/leads/debug/sent-invitations",
            headers=headers
        )

        if resp.status_code != 200:
            print(f"Error {resp.status_code}: {resp.text}")
            return

        result = resp.json()

        print(f"\nAccount: {result.get('account')}")
        print(f"Total sent invitations found: {result.get('total_sent_invitations')}")
        print(f"Matched with pending leads: {result.get('matched_with_pending_leads')}")

        print("\n--- Sent Invitations (from LinkedIn) ---")
        invitations = result.get('invitations', [])
        if invitations:
            for inv in invitations[:15]:
                print(f"  - {inv.get('name', 'Unknown')} ({inv.get('linkedInUrl', 'N/A')})")
                if inv.get('sentAt'):
                    print(f"    Sent: {inv.get('sentAt')}")
        else:
            print("  No invitations found!")

        print("\n--- Matched Leads ---")
        matched = result.get('matched_leads', [])
        if matched:
            for m in matched:
                print(f"  - {m.get('name')} ({m.get('linkedInUrl')})")
        else:
            print("  No matches found between sent invites and pending leads")

        # Also check if Erika Hou is in the invitations
        print("\n--- Checking for Erika Hou ---")
        erika_found = any("erika" in inv.get('name', '').lower() for inv in invitations)
        print(f"Erika Hou in sent invitations: {erika_found}")

if __name__ == "__main__":
    asyncio.run(main())
