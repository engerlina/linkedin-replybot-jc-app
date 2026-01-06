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

        Uses multiple fallback approaches since LinkedIn deprecates endpoints frequently.
        """
        public_id = self._extract_public_id(person_url)
        logger.info(f"Checking connection status for: {public_id}")

        # Try Method 1: identity/dash/profiles with memberRelationship decoration
        try:
            result = await self._check_connection_via_dash_profile(public_id)
            if result != "unknown":
                logger.info(f"Connection status via dash profile: {result}")
                return result
        except Exception as e:
            logger.warning(f"Dash profile connection check failed: {e}")

        # Try Method 2: relationships/memberRelationships endpoint
        try:
            result = await self._check_connection_via_relationships(public_id)
            if result != "unknown":
                logger.info(f"Connection status via relationships: {result}")
                return result
        except Exception as e:
            logger.warning(f"Relationships endpoint check failed: {e}")

        # Try Method 3: Check if we can message them (only works for connected users)
        try:
            result = await self._check_connection_via_messaging(public_id)
            if result != "unknown":
                logger.info(f"Connection status via messaging: {result}")
                return result
        except Exception as e:
            logger.warning(f"Messaging check failed: {e}")

        logger.warning(f"Could not determine connection status for {public_id}")
        return "unknown"

    async def _check_connection_via_dash_profile(self, public_id: str) -> str:
        """Check connection via identity/dash/profiles with memberRelationship decoration"""
        try:
            # Use dash profile endpoint with full decorations including memberRelationship
            response = await self._request(
                "GET",
                "/identity/dash/profiles",
                params={
                    "q": "memberIdentity",
                    "memberIdentity": public_id,
                    "decorationId": "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93"
                }
            )

            elements = response.get("elements", [])
            if not elements:
                logger.debug("No elements in dash profile response")
                return "unknown"

            profile = elements[0]
            logger.info(f"Dash profile keys: {list(profile.keys())}")

            # Log all profile data for debugging
            import json
            logger.info(f"Profile data (truncated): {json.dumps(profile, default=str)[:2000]}")

            # Check memberRelationship field
            member_relation = profile.get("memberRelationship", {})
            if member_relation:
                logger.info(f"memberRelationship: {member_relation}")
                # Check for connection status
                if member_relation.get("memberRelationshipType") == "FIRST_DEGREE":
                    return "connected"
                elif member_relation.get("memberRelationshipType") == "SELF":
                    return "connected"  # User's own profile
                elif member_relation.get("invitationPending"):
                    return "pending"

            # Check networkDistance in profile
            network_distance = profile.get("networkDistance", {})
            if network_distance:
                logger.info(f"networkDistance: {network_distance}")
                distance = network_distance.get("value") or network_distance.get("distance")
                if distance in ("DISTANCE_1", "FIRST_DEGREE"):
                    return "connected"
                elif distance in ("DISTANCE_2", "DISTANCE_3", "SECOND_DEGREE", "THIRD_DEGREE", "OUT_OF_NETWORK"):
                    return "notConnected"

            # Check included entities for relationship info
            included = response.get("included", [])
            logger.info(f"Included entities count: {len(included)}")

            # Log all included entity types for debugging
            entity_types = set()
            for item in included:
                item_type = item.get("$type", "unknown")
                entity_types.add(item_type)
            logger.info(f"Included entity types: {entity_types}")

            for item in included:
                item_type = item.get("$type", "")
                if "MemberRelationship" in item_type or "NetworkDistance" in item_type or "Connection" in item_type:
                    logger.info(f"Found relationship in included: {item}")
                    rel_type = item.get("memberRelationshipType") or item.get("distance")
                    if rel_type in ("FIRST_DEGREE", "DISTANCE_1"):
                        return "connected"
                    elif rel_type in ("SECOND_DEGREE", "THIRD_DEGREE", "DISTANCE_2", "DISTANCE_3"):
                        return "notConnected"

            return "unknown"

        except LinkedInAPIError as e:
            logger.warning(f"Dash profile check error: {e}")
            raise

    async def _check_connection_via_relationships(self, public_id: str) -> str:
        """Check connection via relationships API"""
        try:
            # First get the profile URN
            profile_response = await self._request(
                "GET",
                "/identity/dash/profiles",
                params={
                    "q": "memberIdentity",
                    "memberIdentity": public_id,
                    "decorationId": "com.linkedin.voyager.dash.deco.identity.profile.TopCardSupplementary-85"
                }
            )

            elements = profile_response.get("elements", [])
            if not elements:
                return "unknown"

            entity_urn = elements[0].get("entityUrn", "")
            if not entity_urn:
                return "unknown"

            logger.info(f"Got entity URN: {entity_urn}")

            # Try voyagerRelationshipsDashMemberRelationships
            try:
                rel_response = await self._request(
                    "GET",
                    "/voyagerRelationshipsDashMemberRelationships",
                    params={
                        "q": "member",
                        "member": entity_urn
                    }
                )
                logger.info(f"Relationships response: {rel_response}")

                elements = rel_response.get("elements", [])
                if elements:
                    rel = elements[0]
                    rel_type = rel.get("memberRelationshipType")
                    if rel_type == "FIRST_DEGREE":
                        return "connected"
                    elif rel_type in ("SECOND_DEGREE", "THIRD_DEGREE", "OUT_OF_NETWORK"):
                        return "notConnected"
                    if rel.get("invitationPending"):
                        return "pending"
            except LinkedInAPIError as e:
                logger.debug(f"voyagerRelationshipsDash failed: {e}")

            # Try alternative endpoint format
            try:
                alt_response = await self._request(
                    "GET",
                    f"/relationships/memberRelationships/{entity_urn}"
                )
                logger.info(f"Alt relationships response: {alt_response}")

                rel_type = alt_response.get("memberRelationshipType")
                if rel_type == "FIRST_DEGREE":
                    return "connected"
                elif rel_type:
                    return "notConnected"
            except LinkedInAPIError:
                pass

            return "unknown"

        except LinkedInAPIError as e:
            logger.warning(f"Relationships check error: {e}")
            raise

    async def _check_connection_via_messaging(self, public_id: str) -> str:
        """Check if we can message the person (only works for 1st degree connections)"""
        try:
            # Get profile to find entityUrn
            profile_response = await self._request(
                "GET",
                "/identity/dash/profiles",
                params={
                    "q": "memberIdentity",
                    "memberIdentity": public_id,
                    "decorationId": "com.linkedin.voyager.dash.deco.identity.profile.TopCardSupplementary-85"
                }
            )

            elements = profile_response.get("elements", [])
            if not elements:
                return "unknown"

            # Check for messagingActions in profile
            profile = elements[0]
            primary_actions = profile.get("primaryActions", [])
            for action in primary_actions:
                action_type = action.get("type") or action.get("actionType")
                if action_type == "MESSAGE":
                    # User has message action available = connected
                    return "connected"
                elif action_type == "CONNECT":
                    # User only has connect action = not connected
                    return "notConnected"

            # Check included entities for actions
            included = profile_response.get("included", [])
            for item in included:
                if item.get("$type", "").endswith("PrimaryAction"):
                    action_type = item.get("type")
                    if action_type == "MESSAGE":
                        return "connected"
                    elif action_type == "CONNECT":
                        return "notConnected"

            return "unknown"

        except LinkedInAPIError as e:
            logger.debug(f"Messaging check error: {e}")
            raise

    async def _get_member_urn(self, public_id: str) -> str:
        """Get member URN via dash profiles endpoint (replaces deprecated /identity/profiles)"""
        try:
            profile_response = await self._request(
                "GET",
                "/identity/dash/profiles",
                params={
                    "q": "memberIdentity",
                    "memberIdentity": public_id,
                    "decorationId": "com.linkedin.voyager.dash.deco.identity.profile.TopCardSupplementary-85"
                }
            )

            elements = profile_response.get("elements", [])
            logger.info(f"Profile response elements count: {len(elements)}")

            if elements:
                profile = elements[0]
                logger.info(f"Profile element keys: {list(profile.keys())}")

                # Try entityUrn first
                entity_urn = profile.get("entityUrn", "")
                if entity_urn:
                    logger.info(f"Got member URN from entityUrn: {entity_urn}")
                    return entity_urn

                # Try objectUrn
                object_urn = profile.get("objectUrn", "")
                if object_urn:
                    logger.info(f"Got member URN from objectUrn: {object_urn}")
                    return object_urn

            # Check included entities for member URN
            included = profile_response.get("included", [])
            logger.info(f"Checking {len(included)} included entities for member URN")

            for item in included:
                item_type = item.get("$type", "")
                # Look for profile-related entities
                if "Profile" in item_type or "Member" in item_type:
                    urn = item.get("entityUrn") or item.get("objectUrn")
                    if urn and ("fsd_profile" in urn or "member" in urn):
                        logger.info(f"Got member URN from included: {urn}")
                        return urn

            # Last resort: try to get numeric member ID from the profile
            # and construct the older urn:li:member format
            logger.warning(f"Could not get URN from dash profiles for {public_id}")
            logger.warning(f"Full profile response keys: {profile_response.keys()}")
            return None  # Return None instead of broken constructed URN

        except LinkedInAPIError as e:
            logger.warning(f"Failed to get member URN: {e}")
            return None

    async def send_connection_request(self, person_url: str, note: Optional[str] = None) -> bool:
        """Send a connection request to a person"""
        public_id = self._extract_public_id(person_url)

        try:
            # Get the member URN via dash profiles
            member_urn = await self._get_member_urn(public_id)

            if not member_urn:
                logger.error(f"Could not get member URN for {public_id}. Cannot send connection request.")
                return False

            logger.info(f"Sending connection request to {public_id} using URN: {member_urn}")

            # Method 1: Try with fsd_profile URN (newer format)
            try:
                payload = {
                    "invitee": {
                        "com.linkedin.voyager.growth.invitation.InviteeProfile": {
                            "profileUrn": member_urn
                        }
                    }
                }
                if note:
                    payload["message"] = note[:300]

                await self._request(
                    "POST",
                    "/growth/normInvitations",
                    json_data=payload
                )
                logger.info(f"Sent connection request to {public_id} via normInvitations")
                return True
            except LinkedInAPIError as e:
                logger.warning(f"normInvitations failed with fsd_profile: {e}")

            # Method 2: Try voyagerRelationshipsDashMemberRelationships
            try:
                payload = {
                    "inviteeProfileUrn": member_urn,
                    "invitationType": "CONNECTION"
                }
                if note:
                    payload["customMessage"] = note[:300]

                await self._request(
                    "POST",
                    "/voyagerRelationshipsDashMemberRelationships?action=connect",
                    json_data=payload
                )
                logger.info(f"Sent connection request to {public_id} via voyagerRelationshipsDash")
                return True
            except LinkedInAPIError as e:
                logger.warning(f"voyagerRelationshipsDash failed: {e}")

            # Method 3: Try with fs_miniProfile URN format
            try:
                mini_profile_urn = member_urn.replace("fsd_profile", "fs_miniProfile")
                payload = {
                    "invitee": {
                        "com.linkedin.voyager.growth.invitation.InviteeProfile": {
                            "profileUrn": mini_profile_urn
                        }
                    }
                }
                if note:
                    payload["message"] = note[:300]

                await self._request(
                    "POST",
                    "/growth/normInvitations",
                    json_data=payload
                )
                logger.info(f"Sent connection request to {public_id} via fs_miniProfile")
                return True
            except LinkedInAPIError as e:
                logger.warning(f"normInvitations failed with fs_miniProfile: {e}")

            # Method 4: Try relationships/invitation endpoint
            try:
                payload = {
                    "inviteeUrn": member_urn,
                    "message": note[:300] if note else ""
                }

                await self._request(
                    "POST",
                    "/relationships/invitation",
                    json_data=payload
                )
                logger.info(f"Sent connection request to {public_id} via relationships/invitation")
                return True
            except LinkedInAPIError as e:
                logger.error(f"All connection request methods failed. Last error: {e}")
                return False

        except LinkedInAPIError as e:
            logger.error(f"Failed to send connection request: {e}")
            return False

    async def send_message(self, person_url: str, text: str) -> bool:
        """Send a direct message to a connected person"""
        public_id = self._extract_public_id(person_url)

        try:
            # Get member URN via dash profiles
            member_urn = await self._get_member_urn(public_id)

            if not member_urn:
                raise LinkedInAPIError(f"Could not get member URN for {public_id}. Cannot send message.")

            logger.info(f"Sending message to {public_id} using URN: {member_urn}")

            import time
            import uuid

            # Method 1: Try voyagerMessagingDashMessengerMessages with correct format
            try:
                # The URN needs to be in a specific format for messaging
                # hostRecipientUrn should be the conversation participant URN
                message_payload = {
                    "dedupeByClientGeneratedToken": False,
                    "hostRecipientUrn": member_urn,
                    "message": {
                        "body": {
                            "text": text,
                            "attributes": []
                        },
                        "originToken": str(uuid.uuid4()),
                        "renderContentUnions": []
                    }
                }

                logger.info(f"Trying voyagerMessagingDash with payload keys: {list(message_payload.keys())}")

                await self._request(
                    "POST",
                    "/voyagerMessagingDashMessengerMessages?action=createMessage",
                    json_data=message_payload
                )
                logger.info(f"Sent message to {public_id} via voyagerMessagingDash")
                return True
            except LinkedInAPIError as e:
                logger.warning(f"voyagerMessagingDash failed: {e}")

            # Method 2: Try messaging/conversations with miniProfile format
            try:
                # Try with urn:li:fs_miniProfile format
                mini_profile_urn = member_urn.replace("fsd_profile", "fs_miniProfile")

                payload = {
                    "keyVersion": "LEGACY_INBOX",
                    "conversationCreate": {
                        "recipients": [mini_profile_urn],
                        "subtype": "MEMBER_TO_MEMBER"
                    },
                    "message": {
                        "body": text,
                        "originToken": str(uuid.uuid4())
                    }
                }

                logger.info(f"Trying legacy endpoint with miniProfile URN: {mini_profile_urn}")

                await self._request(
                    "POST",
                    "/messaging/conversations",
                    json_data=payload
                )
                logger.info(f"Sent message to {public_id} via legacy endpoint")
                return True
            except LinkedInAPIError as e:
                logger.warning(f"Legacy messaging failed with miniProfile URN: {e}")

            # Method 3: Try with original fsd_profile URN
            try:
                payload = {
                    "keyVersion": "LEGACY_INBOX",
                    "conversationCreate": {
                        "recipients": [member_urn],
                        "subtype": "MEMBER_TO_MEMBER"
                    },
                    "message": {
                        "body": text,
                        "originToken": str(uuid.uuid4())
                    }
                }

                logger.info(f"Trying legacy endpoint with fsd_profile URN: {member_urn}")

                await self._request(
                    "POST",
                    "/messaging/conversations",
                    json_data=payload
                )
                logger.info(f"Sent message to {public_id} via legacy endpoint (fsd_profile)")
                return True
            except LinkedInAPIError as e:
                logger.error(f"All messaging methods failed: {e}")
                raise

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
