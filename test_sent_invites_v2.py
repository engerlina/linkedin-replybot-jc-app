"""
Fetch actual sent invitations with detailed debug info
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

        print("\nFetching sent invitations with debug info...")
        resp = await client.get(
            f"{BASE_URL}/api/leads/debug/sent-invitations",
            headers=headers
        )

        if resp.status_code != 200:
            print(f"Error {resp.status_code}: {resp.text}")
            return

        result = resp.json()

        print(f"\n=== Debug Log ===")
        for line in result.get('debug_log', []):
            print(f"  {line}")

        print(f"\n=== Raw Responses ===")
        for endpoint, data in result.get('raw_responses', {}).items():
            print(f"\n{endpoint}:")
            if 'error' in data:
                print(f"  ERROR: {data['error']}")
            else:
                print(f"  Elements: {data.get('elements', 'N/A')}")
                if data.get('sample'):
                    print(f"  Sample: {data['sample'][:300]}...")

        print(f"\n=== Summary ===")
        print(f"Account: {result.get('account')}")
        print(f"Total sent invitations: {result.get('total_sent_invitations')}")
        print(f"Matched with pending leads: {result.get('matched_with_pending_leads')}")

if __name__ == "__main__":
    asyncio.run(main())
