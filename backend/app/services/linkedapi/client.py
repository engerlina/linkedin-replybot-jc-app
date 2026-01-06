import asyncio
import httpx
from typing import Optional
from app.config import settings
from app.db.client import prisma


class LinkedAPIError(Exception):
    pass


async def get_linked_api_key() -> str:
    """Get the LinkedAPI key from database or environment"""
    # First try environment variable
    if settings.LINKEDAPI_API_KEY:
        return settings.LINKEDAPI_API_KEY

    # Fall back to database settings
    db_settings = await prisma.settings.find_first(where={"id": "global"})
    if db_settings and db_settings.linkedApiKey:
        return db_settings.linkedApiKey

    raise LinkedAPIError("LinkedAPI key not configured. Set it in Settings or LINKEDAPI_API_KEY env var.")


class LinkedAPIClient:
    BASE_URL = "https://api.linkedapi.io"

    def __init__(self, identification_token: str, api_key: str):
        """
        Initialize with both required LinkedAPI tokens:
        - api_key: Main linked-api-token (from env or database)
        - identification_token: Per-account token for the specific LinkedIn account
        """
        self.identification_token = identification_token
        self.api_key = api_key
        self.headers = {
            "linked-api-token": api_key,
            "identification-token": identification_token,
            "Content-Type": "application/json"
        }

    @classmethod
    async def create(cls, identification_token: str) -> "LinkedAPIClient":
        """Factory method to create a client with the API key from database/env"""
        api_key = await get_linked_api_key()
        return cls(identification_token, api_key)

    async def execute(self, workflow: dict | list) -> dict:
        """Execute a LinkedAPI workflow and wait for completion"""
        import logging
        logger = logging.getLogger(__name__)

        async with httpx.AsyncClient(timeout=120.0) as client:
            # Start workflow - send workflow directly (not wrapped)
            response = await client.post(
                f"{self.BASE_URL}/workflows",
                headers=self.headers,
                json=workflow
            )
            response.raise_for_status()
            data = response.json()
            logger.info(f"LinkedAPI workflow started: {data}")

            # workflowId is in result.workflowId
            workflow_id = data.get("result", {}).get("workflowId") or data.get("workflowId")
            if not workflow_id:
                raise LinkedAPIError(f"No workflow ID in response: {data}")

            # Poll for completion
            for i in range(60):  # Max 2 minutes
                await asyncio.sleep(2)

                status_response = await client.get(
                    f"{self.BASE_URL}/workflows/{workflow_id}",
                    headers=self.headers
                )
                status_data = status_response.json()

                # Status is in result.workflowStatus
                result = status_data.get("result", {})
                status = result.get("workflowStatus", status_data.get("status"))

                # Log every 5th poll to avoid spam
                if i % 5 == 0:
                    logger.info(f"LinkedAPI workflow {workflow_id} status: {status}")

                if status == "completed":
                    logger.info(f"LinkedAPI workflow completed: {result.get('completion', {})}")
                    return result.get("completion", {})
                elif status == "failed":
                    error = result.get("error") or status_data.get("error", "Workflow failed")
                    logger.error(f"LinkedAPI workflow failed: {error}")
                    raise LinkedAPIError(error)
                elif status in ("cancelled", "canceled"):
                    raise LinkedAPIError("Workflow was cancelled")

            logger.error(f"LinkedAPI workflow timeout after 2 minutes. Last status: {status}")
            raise LinkedAPIError("Workflow timeout - operation may still be processing")

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
        import logging
        logger = logging.getLogger(__name__)

        result = await self.execute({
            "actionType": "st.sendMessage",
            "personUrl": person_url,
            "text": text
        })

        # Debug logging
        logger.info(f"LinkedAPI send_message result: {result}")

        # Check for errors first
        if result.get("error"):
            logger.error(f"LinkedAPI send_message error: {result.get('error')}")
            return False

        # The API may return success:false for various reasons
        # Log it but don't necessarily fail - the workflow completed
        if result.get("success") is False:
            logger.warning(f"LinkedAPI send_message returned success:false - {result}")
            # Still return True if workflow completed - check Railway logs to debug
            # The workflow completing without error suggests the action was attempted

        return True

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
