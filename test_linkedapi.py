"""
Test script for LinkedAPI authentication and post reading
Run: python test_linkedapi.py
"""
import httpx
import asyncio
import json


# LinkedAPI credentials
LINKEDAPI_API_KEY = "linked_mk0647fp4644799208cbea3b2789dd5d33e731a8975b5241423f6b7a"  # Main API key
IDENTIFICATION_TOKEN = "id_mk1muswfffbddbdf97ba4cbf4967d559789f9aed26933791e6ce0749"  # ID token

# Test post URL
TEST_POST_URL = "https://www.linkedin.com/feed/update/urn:li:activity:7413754409727455232/"


async def test_linkedapi():
    print("=" * 60)
    print("LinkedAPI Test Script")
    print("=" * 60)

    base_url = "https://api.linkedapi.io"

    headers = {
        "linked-api-token": LINKEDAPI_API_KEY,
        "identification-token": IDENTIFICATION_TOKEN,
        "Content-Type": "application/json"
    }

    print(f"\nAPI Key: {LINKEDAPI_API_KEY[:20]}...")
    print(f"Identification Token: {IDENTIFICATION_TOKEN[:20]}...")
    print(f"Post URL: {TEST_POST_URL}")

    async with httpx.AsyncClient(timeout=120.0) as client:
        # Test 1: Get post comments using workflow API (matching our client.py)
        print("\n1. Testing get post comments (workflow API)...")
        try:
            # Try different workflow formats
            workflow = {
                "actionType": "st.retrievePostComments",
                "postUrl": TEST_POST_URL,
                "sort": "mostRecent",
                "limit": 10
            }
            print(f"   Request: {json.dumps(workflow, indent=2)}")

            response = await client.post(
                f"{base_url}/workflows",
                headers=headers,
                json=workflow
            )
            print(f"   Status Code: {response.status_code}")
            print(f"   Response: {response.text[:500] if response.text else 'empty'}")

            if response.status_code in [200, 201, 202]:
                data = response.json()
                # workflowId can be in data directly or in data.result
                workflow_id = data.get("workflowId") or data.get("result", {}).get("workflowId")

                if workflow_id:
                    print(f"\n   Workflow started: {workflow_id}")
                    print("   Polling for completion...")

                    # Poll for completion
                    for i in range(30):  # Max 1 minute
                        await asyncio.sleep(2)

                        status_response = await client.get(
                            f"{base_url}/workflows/{workflow_id}",
                            headers=headers
                        )
                        status_data = status_response.json()
                        # Status might be in different places
                        status = status_data.get("status") or status_data.get("result", {}).get("status", "unknown")
                        print(f"   Poll {i+1}: Status = {status}, Response = {json.dumps(status_data)[:200]}")

                        if status == "completed":
                            print("\n   SUCCESS: Workflow completed!")
                            completion = status_data.get("completion", {})
                            print(f"   Completion data: {json.dumps(completion, indent=2)[:1000]}")
                            break
                        elif status == "failed":
                            print(f"   FAILED: {status_data.get('error', 'Unknown error')}")
                            print(f"   Full response: {json.dumps(status_data, indent=2)}")
                            break
                    else:
                        print("   TIMEOUT: Workflow did not complete in time")
                else:
                    print(f"   No workflow ID returned. Full response: {response.text}")
            else:
                print(f"   ERROR Response: {response.text}")

        except Exception as e:
            print(f"   ERROR: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 60)
    print("Test complete!")


if __name__ == "__main__":
    asyncio.run(test_linkedapi())
