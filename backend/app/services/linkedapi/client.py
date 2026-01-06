import asyncio
import httpx
from typing import Optional
from app.config import settings


class LinkedAPIError(Exception):
    pass


class LinkedAPIClient:
    BASE_URL = "https://api.linkedapi.io"

    def __init__(self, identification_token: str):
        """
        Initialize with both required LinkedAPI tokens:
        - linked-api-token: Main API key from settings (LINKEDAPI_API_KEY)
        - identification-token: Per-account token for the specific LinkedIn account
        """
        self.identification_token = identification_token
        self.headers = {
            "linked-api-token": settings.LINKEDAPI_API_KEY,
            "identification-token": identification_token,
            "Content-Type": "application/json"
        }

    async def execute(self, workflow: dict | list) -> dict:
        """Execute a LinkedAPI workflow and wait for completion"""
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Start workflow
            response = await client.post(
                f"{self.BASE_URL}/workflows",
                headers=self.headers,
                json={
                    "workflow": workflow
                }
            )
            response.raise_for_status()
            data = response.json()

            workflow_id = data["workflowId"]

            # Poll for completion
            for _ in range(60):  # Max 2 minutes
                await asyncio.sleep(2)

                status_response = await client.get(
                    f"{self.BASE_URL}/workflows/{workflow_id}",
                    headers=self.headers
                )
                status_data = status_response.json()

                if status_data["status"] == "completed":
                    return status_data.get("completion", {})
                elif status_data["status"] == "failed":
                    raise LinkedAPIError(status_data.get("error", "Workflow failed"))

            raise LinkedAPIError("Workflow timeout")

    # Convenience methods
    async def get_post_comments(self, post_url: str, limit: int = 50) -> list:
        result = await self.execute({
            "actionType": "st.retrievePostComments",
            "postUrl": post_url,
            "sort": "mostRecent",
            "limit": limit
        })
        return result.get("data", [])

    async def comment_on_post(self, post_url: str, text: str) -> bool:
        result = await self.execute({
            "actionType": "st.commentOnPost",
            "postUrl": post_url,
            "text": text
        })
        return result.get("success", False)

    async def check_connection(self, person_url: str) -> str:
        result = await self.execute({
            "actionType": "st.checkConnectionStatus",
            "personUrl": person_url
        })
        return result.get("data", {}).get("connectionStatus", "unknown")

    async def send_connection_request(self, person_url: str, note: Optional[str] = None) -> bool:
        workflow = {
            "actionType": "st.sendConnectionRequest",
            "personUrl": person_url
        }
        if note:
            workflow["note"] = note[:300]  # LinkedIn limit

        result = await self.execute(workflow)
        return result.get("success", False)

    async def send_message(self, person_url: str, text: str) -> bool:
        result = await self.execute({
            "actionType": "st.sendMessage",
            "personUrl": person_url,
            "text": text
        })
        return result.get("success", False)

    async def get_person_posts(self, person_url: str, limit: int = 5, since: Optional[str] = None) -> list:
        result = await self.execute({
            "actionType": "st.openPersonPage",
            "personUrl": person_url,
            "then": [{
                "actionType": "st.retrievePersonPosts",
                "limit": limit,
                **({"since": since} if since else {})
            }]
        })
        return result.get("data", {}).get("then", [{}])[0].get("data", [])

    async def react_and_comment(self, post_url: str, comment: str, reaction: str = "like") -> bool:
        result = await self.execute({
            "actionType": "st.openPost",
            "postUrl": post_url,
            "basicInfo": False,
            "then": [
                {"actionType": "st.reactToPost", "type": reaction},
                {"actionType": "st.commentOnPost", "text": comment}
            ]
        })
        return result.get("success", False)
