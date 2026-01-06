"""
LinkedIn Direct API Client

Makes direct calls to LinkedIn's Voyager API using browser cookies.
Replaces the third-party LinkedAPI service.

Based on patterns from Taplio Chrome extension.
"""

import asyncio
import logging
import re
from typing import Optional, List
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)


class LinkedInAPIError(Exception):
    """Base exception for LinkedIn API errors"""
    pass


class LinkedInAuthError(LinkedInAPIError):
    """Authentication/cookie expired error"""
    pass


class LinkedInRateLimitError(LinkedInAPIError):
    """Rate limit exceeded"""
    pass


class LinkedInDirectClient:
    """
    Direct LinkedIn Voyager API client using browser cookies.

    This replaces the LinkedAPI third-party service by making direct
    authenticated requests to LinkedIn's internal API.
    """

    BASE_URL = "https://www.linkedin.com/voyager/api"

    def __init__(self, li_at: str, jsession_id: str, user_agent: str = None):
        """
        Initialize with LinkedIn cookies.

        Args:
            li_at: The li_at session cookie value
            jsession_id: The JSESSIONID cookie value
            user_agent: Optional browser user agent string
        """
        self.li_at = li_at
        self.jsession_id = jsession_id
        # CSRF token is JSESSIONID with quotes stripped (as per Taplio pattern)
        self.csrf_token = jsession_id.replace('"', '').replace("'", "")
        self.user_agent = user_agent or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        self.account_id = None  # Set when created via factory method

    @classmethod
    async def create(cls, account_id: str) -> "LinkedInDirectClient":
        """
        Factory method to create client from account ID.
        Fetches cookies from database.
        """
        from app.db.client import prisma

        cookie = await prisma.linkedincookie.find_unique(
            where={"accountId": account_id}
        )
        if not cookie:
            raise LinkedInAuthError(
                f"No cookies found for account {account_id}. "
                "Please sync your LinkedIn session from the Chrome extension."
            )
        if not cookie.isValid:
            raise LinkedInAuthError(
                f"LinkedIn cookies are invalid/expired for account {account_id}. "
                "Please re-sync from the Chrome extension."
            )

        client = cls(
            li_at=cookie.liAt,
            jsession_id=cookie.jsessionId,
            user_agent=cookie.userAgent
        )
        client.account_id = account_id
        return client

    def _get_headers(self) -> dict:
        """Build headers for LinkedIn API requests (Taplio pattern)"""
        return {
            "cookie": f"li_at={self.li_at};JSESSIONID={self.jsession_id}",
            "csrf-token": self.csrf_token,
            "user-agent": self.user_agent,
            "accept": "application/vnd.linkedin.normalized+json+2.1",
            "accept-language": "en-US,en;q=0.9",
            "x-li-lang": "en_US",
            "x-restli-protocol-version": "2.0.0",
        }

    async def _request(
        self,
        method: str,
        endpoint: str,
        params: dict = None,
        json_data: dict = None,
        timeout: float = 30.0
    ) -> dict:
        """Make authenticated request to LinkedIn Voyager API"""
        url = f"{self.BASE_URL}{endpoint}"

        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=self._get_headers(),
                    params=params,
                    json=json_data
                )

                logger.debug(f"LinkedIn API {method} {endpoint} -> {response.status_code}")

                if response.status_code == 401:
                    await self._mark_cookies_invalid("401 Unauthorized")
                    raise LinkedInAuthError("Authentication failed - cookies may have expired")
                elif response.status_code == 403:
                    await self._mark_cookies_invalid("403 Forbidden")
                    raise LinkedInAuthError("Access forbidden - cookies may be invalid")
                elif response.status_code == 429:
                    raise LinkedInRateLimitError("LinkedIn rate limit exceeded - try again later")
                elif response.status_code >= 400:
                    error_text = response.text[:500] if response.text else "Unknown error"
                    raise LinkedInAPIError(f"API error {response.status_code}: {error_text}")

                # Update last used timestamp
                await self._update_last_used()

                return response.json() if response.text else {}

            except httpx.TimeoutException:
                raise LinkedInAPIError("Request timed out")
            except httpx.RequestError as e:
                raise LinkedInAPIError(f"Request failed: {str(e)}")

    async def _mark_cookies_invalid(self, error: str):
        """Mark cookies as invalid in database"""
        if self.account_id:
            try:
                from app.db.client import prisma
                await prisma.linkedincookie.update(
                    where={"accountId": self.account_id},
                    data={"isValid": False, "lastError": error}
                )
            except Exception as e:
                logger.error(f"Failed to mark cookies invalid: {e}")

    async def _update_last_used(self):
        """Update last used timestamp"""
        if self.account_id:
            try:
                from app.db.client import prisma
                from datetime import datetime
                await prisma.linkedincookie.update(
                    where={"accountId": self.account_id},
                    data={"lastUsedAt": datetime.utcnow()}
                )
            except Exception:
                pass  # Non-critical, don't fail the request

    # ==========================================
    # URN/ID Extraction Helpers
    # ==========================================

    def _extract_activity_id(self, post_url: str) -> str:
        """
        Extract activity ID from post URL.

        Handles formats:
        - https://www.linkedin.com/feed/update/urn:li:activity:7123456789/
        - https://www.linkedin.com/posts/username_slug-activity-7123456789-xxxx
        """
        # Try urn:li:activity format
        match = re.search(r'activity[:\-](\d+)', post_url)
        if match:
            return match.group(1)

        # Try ugcPost format
        match = re.search(r'ugcPost[:\-](\d+)', post_url)
        if match:
            return match.group(1)

        raise LinkedInAPIError(f"Could not extract activity ID from URL: {post_url}")

    def _extract_public_id(self, profile_url: str) -> str:
        """
        Extract public identifier from profile URL.

        Handles:
        - https://www.linkedin.com/in/john-doe/
        - https://linkedin.com/in/john-doe
        - www.linkedin.com/in/john-doe
        - /in/john-doe
        - john-doe (just username)
        """
        if not profile_url:
            raise LinkedInAPIError("Profile URL is empty")

        profile_url = profile_url.strip()

        # Try full URL format
        match = re.search(r'linkedin\.com/in/([^/\?\s]+)', profile_url)
        if match:
            return match.group(1)

        # Try /in/username format
        match = re.search(r'^/in/([^/\?\s]+)', profile_url)
        if match:
            return match.group(1)

        # Try in/username format (without leading slash)
        match = re.search(r'^in/([^/\?\s]+)', profile_url)
        if match:
            return match.group(1)

        # If it looks like a plain username (alphanumeric with hyphens), use it directly
        if re.match(r'^[a-zA-Z0-9\-]+$', profile_url):
            return profile_url

        raise LinkedInAPIError(f"Could not extract public ID from URL: {profile_url}")

    # ==========================================
    # Core API Methods - Match LinkedAPIClient interface
    # ==========================================

    async def get_post_comments(self, post_url: str, limit: int = 50) -> List[dict]:
        """
        Fetch comments from a LinkedIn post.

        Returns list of comment dicts with:
        - commenterUrl
        - commenterName
        - commenterHeadline
        - text
        - time
        """
        activity_id = self._extract_activity_id(post_url)

        comments = []
        start = 0

        while len(comments) < limit:
            # Endpoint pattern from Taplio
            response = await self._request(
                "GET",
                "/feed/comments",
                params={
                    "q": "comments",
                    "sortOrder": "RELEVANCE",
                    "start": start,
                    "count": min(10, limit - len(comments)),
                    "updateId": f"activity:{activity_id}"
                }
            )

            elements = response.get("elements", [])
            if not elements:
                break

            for element in elements:
                comment = self._parse_comment(element)
                if comment:
                    comments.append(comment)

            start += len(elements)

            # Check for pagination
            if len(elements) < 10:
                break

            # Small delay between pagination requests
            await asyncio.sleep(0.5)

        logger.info(f"Fetched {len(comments)} comments from post")
        return comments[:limit]

    def _parse_comment(self, element: dict) -> Optional[dict]:
        """Parse a comment element into standardized format (Taplio pattern)"""
        try:
            commenter = element.get("commenter", {})
            profile = commenter.get("com.linkedin.voyager.feed.MemberActor", {})
            mini_profile = profile.get("miniProfile", {})

            if not mini_profile:
                return None

            public_id = mini_profile.get("publicIdentifier", "")
            first_name = mini_profile.get("firstName", "")
            last_name = mini_profile.get("lastName", "")

            return {
                "commenterUrl": f"https://www.linkedin.com/in/{public_id}" if public_id else "",
                "commenterName": f"{first_name} {last_name}".strip(),
                "commenterHeadline": mini_profile.get("occupation", ""),
                "text": element.get("commentV2", {}).get("text", ""),
                "time": element.get("createdTime", "")
            }
        except Exception as e:
            logger.warning(f"Failed to parse comment: {e}")
            return None

    async def comment_on_post(self, post_url: str, text: str) -> bool:
        """Post a comment/reply on a LinkedIn post"""
        activity_id = self._extract_activity_id(post_url)

        try:
            await self._request(
                "POST",
                "/feed/comments",
                json_data={
                    "threadUrn": f"urn:li:activity:{activity_id}",
                    "commentText": text
                }
            )
            logger.info(f"Posted comment on {post_url}")
            return True
        except LinkedInAPIError as e:
            logger.error(f"Failed to post comment: {e}")
            return False

    async def check_connection(self, person_url: str) -> str:
        """
        Check connection status with a person.

        Returns: "connected", "pending", "notConnected", or "unknown"
        """
        public_id = self._extract_public_id(person_url)

        try:
            # Try the networkinfo endpoint first
            response = await self._request(
                "GET",
                f"/identity/profiles/{public_id}/networkinfo"
            )

            logger.info(f"NetworkInfo response for {public_id}: {response}")

            # Check various response formats
            distance = response.get("distance", {})
            if isinstance(distance, dict):
                distance_value = distance.get("value", "")
            else:
                distance_value = str(distance)

            logger.info(f"Distance value: {distance_value}")

            if distance_value == "DISTANCE_1":
                return "connected"
            elif distance_value in ("DISTANCE_2", "DISTANCE_3", "OUT_OF_NETWORK"):
                return "notConnected"

            # Also check for followingInfo which indicates connection
            following_info = response.get("followingInfo", {})
            if following_info.get("followingType") == "FOLLOWING":
                # We're following them but might not be connected
                pass

            # Check for connectionStatus in response
            conn_status = response.get("connectionStatus")
            if conn_status == "CONNECTED":
                return "connected"

            # Try alternate check via profile endpoint
            try:
                profile_response = await self._request(
                    "GET",
                    f"/identity/profiles/{public_id}"
                )
                logger.info(f"Profile response keys: {profile_response.keys()}")

                # Check for network distance in profile
                network_distance = profile_response.get("networkDistance", {})
                if isinstance(network_distance, dict):
                    nd_value = network_distance.get("value", "")
                    if nd_value == "DISTANCE_1":
                        return "connected"
                    elif nd_value in ("DISTANCE_2", "DISTANCE_3"):
                        return "notConnected"
            except Exception as e:
                logger.warning(f"Profile check failed: {e}")

            return "unknown"

        except LinkedInAPIError as e:
            logger.warning(f"Failed to check connection: {e}")
            return "unknown"

    async def send_connection_request(self, person_url: str, note: Optional[str] = None) -> bool:
        """Send a connection request to a person"""
        public_id = self._extract_public_id(person_url)

        try:
            # First get the member URN
            profile = await self._request("GET", f"/identity/profiles/{public_id}")
            member_urn = profile.get("entityUrn", "")

            if not member_urn:
                # Try alternative format
                member_urn = f"urn:li:fsd_profile:{public_id}"

            payload = {
                "invitee": {
                    "com.linkedin.voyager.growth.invitation.InviteeProfile": {
                        "profileUrn": member_urn
                    }
                }
            }

            if note:
                payload["message"] = note[:300]  # LinkedIn limit

            await self._request(
                "POST",
                "/growth/normInvitations",
                json_data=payload
            )
            logger.info(f"Sent connection request to {public_id}")
            return True

        except LinkedInAPIError as e:
            logger.error(f"Failed to send connection request: {e}")
            return False

    async def send_message(self, person_url: str, text: str) -> bool:
        """Send a direct message to a connected person"""
        public_id = self._extract_public_id(person_url)

        try:
            # Get profile URN
            profile = await self._request("GET", f"/identity/profiles/{public_id}")
            member_urn = profile.get("entityUrn", "")

            if not member_urn:
                raise LinkedInAPIError("Could not get member URN for messaging")

            # Create conversation and send message
            import time
            payload = {
                "keyVersion": "LEGACY_INBOX",
                "conversationCreate": {
                    "recipients": [member_urn],
                    "subtype": "MEMBER_TO_MEMBER"
                },
                "message": {
                    "body": text,
                    "originToken": f"web_{int(time.time() * 1000)}"
                }
            }

            await self._request(
                "POST",
                "/messaging/conversations",
                json_data=payload
            )
            logger.info(f"Sent message to {public_id}")
            return True

        except LinkedInAPIError as e:
            logger.error(f"Failed to send message: {e}")
            raise  # Re-raise so caller knows the specific error

    async def get_person_posts(self, person_url: str, limit: int = 5, since: Optional[str] = None) -> List[dict]:
        """Get recent posts from a person's profile"""
        public_id = self._extract_public_id(person_url)

        try:
            # First get their dashEntityUrn
            profile = await self._request(
                "GET",
                f"/identity/dash/profiles",
                params={
                    "q": "memberIdentity",
                    "memberIdentity": public_id,
                    "decorationId": "com.linkedin.voyager.dash.deco.identity.profile.TopCardSupplementary-85"
                }
            )

            elements = profile.get("elements", [])
            if not elements:
                return []

            dash_urn = elements[0].get("entityUrn", "")
            if not dash_urn:
                return []

            # Fetch posts using the dashEntityUrn
            response = await self._request(
                "GET",
                "/identity/profileUpdatesV2",
                params={
                    "count": limit,
                    "includeLongTermHistory": "true",
                    "moduleKey": "member-shares:phone",
                    "numComments": 0,
                    "numLikes": 0,
                    "profileUrn": dash_urn,
                    "q": "memberShareFeed"
                }
            )

            posts = []
            for element in response.get("elements", []):
                post_url = None
                actions = element.get("updateMetadata", {}).get("actions", [])
                for action in actions:
                    if action.get("actionType") == "SHARE_VIA":
                        post_url = action.get("url")
                        break

                posts.append({
                    "url": post_url or "",
                    "text": element.get("commentary", {}).get("text", {}).get("text", ""),
                    "time": element.get("actor", {}).get("subDescription", {}).get("text", "")
                })

            return posts[:limit]

        except LinkedInAPIError as e:
            logger.error(f"Failed to get person posts: {e}")
            return []

    async def react_and_comment(self, post_url: str, comment: str, reaction: str = "like") -> bool:
        """React to a post and add a comment"""
        activity_id = self._extract_activity_id(post_url)
        activity_urn = f"urn:li:activity:{activity_id}"

        # Map reaction types
        reaction_map = {
            "like": "LIKE",
            "celebrate": "EMPATHY",
            "support": "INTEREST",
            "love": "APPRECIATION",
            "insightful": "PRAISE",
            "funny": "ENTERTAINMENT"
        }

        reaction_type = reaction_map.get(reaction.lower(), "LIKE")

        # Send reaction
        try:
            await self._request(
                "POST",
                "/voyagerSocialDashReactions",
                params={
                    "q": "reactionType",
                    "reactionType": reaction_type,
                    "threadUrn": activity_urn
                },
                json_data={"reactionType": reaction_type}
            )
        except LinkedInAPIError as e:
            logger.warning(f"Failed to add reaction (continuing with comment): {e}")

        # Send comment
        return await self.comment_on_post(post_url, comment)

    async def get_own_profile(self) -> dict:
        """Get the authenticated user's profile - useful for validation"""
        response = await self._request("GET", "/me")
        return {
            "firstName": response.get("miniProfile", {}).get("firstName", ""),
            "lastName": response.get("miniProfile", {}).get("lastName", ""),
            "publicIdentifier": response.get("miniProfile", {}).get("publicIdentifier", ""),
            "entityUrn": response.get("miniProfile", {}).get("entityUrn", "")
        }
