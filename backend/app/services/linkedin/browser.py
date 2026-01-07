"""
LinkedIn Browser Automation Service

Uses Playwright for browser-based LinkedIn automation.
This bypasses API-level detection by simulating real browser behavior.
"""

import asyncio
import logging
import re
from typing import Optional
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

logger = logging.getLogger(__name__)


class LinkedInBrowserError(Exception):
    """Base exception for browser automation errors"""
    pass


class LinkedInBrowserAuthError(LinkedInBrowserError):
    """Cookie/authentication error"""
    pass


class LinkedInBrowserService:
    """
    Browser-based LinkedIn automation using Playwright.

    Uses stored cookies for authentication and performs actions
    through the actual LinkedIn web interface.
    """

    def __init__(self, li_at: str, jsession_id: str, headless: bool = True):
        """
        Initialize with LinkedIn cookies.

        Args:
            li_at: The li_at session cookie value
            jsession_id: The JSESSIONID cookie value
            headless: Run browser in headless mode (default True for production)
        """
        self.li_at = li_at
        self.jsession_id = jsession_id
        self.headless = headless
        self.account_id: Optional[str] = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._playwright = None

    @classmethod
    async def create(cls, account_id: str, headless: bool = True) -> "LinkedInBrowserService":
        """
        Factory method to create service from account ID.
        Fetches cookies from database.
        """
        from app.db.client import prisma

        cookie = await prisma.linkedincookie.find_unique(
            where={"accountId": account_id}
        )
        if not cookie:
            raise LinkedInBrowserAuthError(
                f"No cookies found for account {account_id}. "
                "Please sync your LinkedIn session from the Chrome extension."
            )
        if not cookie.isValid:
            raise LinkedInBrowserAuthError(
                f"LinkedIn cookies are invalid/expired for account {account_id}. "
                "Please re-sync from the Chrome extension."
            )

        service = cls(
            li_at=cookie.liAt,
            jsession_id=cookie.jsessionId,
            headless=headless
        )
        service.account_id = account_id
        return service

    async def _get_browser(self) -> Browser:
        """Get or create browser instance"""
        if not self._browser:
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                headless=self.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--no-sandbox',
                ]
            )
        return self._browser

    async def _get_context(self) -> BrowserContext:
        """Get or create browser context with LinkedIn cookies"""
        if not self._context:
            browser = await self._get_browser()

            # Create context with cookies
            self._context = await browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                java_script_enabled=True,
            )

            # Set LinkedIn cookies
            await self._context.add_cookies([
                {
                    'name': 'li_at',
                    'value': self.li_at,
                    'domain': '.linkedin.com',
                    'path': '/',
                    'secure': True,
                    'httpOnly': True,
                },
                {
                    'name': 'JSESSIONID',
                    'value': self.jsession_id,
                    'domain': '.linkedin.com',
                    'path': '/',
                    'secure': True,
                }
            ])

        return self._context

    async def close(self):
        """Clean up browser resources"""
        if self._context:
            await self._context.close()
            self._context = None
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    def _extract_public_id(self, profile_url: str) -> str:
        """Extract public identifier from profile URL"""
        if not profile_url:
            raise LinkedInBrowserError("Profile URL is empty")

        profile_url = profile_url.strip()

        # Try full URL format
        match = re.search(r'linkedin\.com/in/([^/\?\s]+)', profile_url)
        if match:
            return match.group(1)

        # If it looks like a plain username
        if re.match(r'^[a-zA-Z0-9\-]+$', profile_url):
            return profile_url

        raise LinkedInBrowserError(f"Could not extract public ID from URL: {profile_url}")

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

    async def send_connection_request(
        self,
        person_url: str,
        note: Optional[str] = None,
        timeout: int = 30000
    ) -> dict:
        """
        Send a connection request using browser automation.

        Args:
            person_url: LinkedIn profile URL
            note: Optional connection note (max 300 chars)
            timeout: Timeout in milliseconds

        Returns:
            dict with 'success', 'message', and 'debug_log'
        """
        debug_log = []
        public_id = self._extract_public_id(person_url)
        profile_url = f"https://www.linkedin.com/in/{public_id}/"

        debug_log.append(f"Target profile: {profile_url}")

        context = await self._get_context()
        page = await context.new_page()

        try:
            # Navigate to profile
            debug_log.append("Navigating to profile...")
            # Use domcontentloaded instead of networkidle - LinkedIn never truly becomes idle
            await page.goto(profile_url, wait_until='domcontentloaded', timeout=timeout)
            await asyncio.sleep(3)  # Let page fully render and JS execute

            # Check if we're logged in (look for sign-in prompt)
            if await page.locator('button:has-text("Sign in")').count() > 0:
                debug_log.append("ERROR: Not logged in - cookies may be expired")
                await self._mark_cookies_invalid("Browser session not authenticated")
                raise LinkedInBrowserAuthError("Not logged in - cookies expired")

            # Take screenshot for debugging
            debug_log.append("Page loaded, looking for Connect button...")

            # Look for Connect button - multiple possible selectors
            connect_button = None
            connect_selectors = [
                'button:has-text("Connect"):visible',
                'button[aria-label*="Invite"][aria-label*="connect"]:visible',
                'button.pvs-profile-actions__action:has-text("Connect"):visible',
                '[data-control-name="connect"]:visible',
                'button.artdeco-button--primary:has-text("Connect"):visible',
            ]

            for selector in connect_selectors:
                try:
                    btn = page.locator(selector).first
                    if await btn.count() > 0 and await btn.is_visible():
                        connect_button = btn
                        debug_log.append(f"Found Connect button with: {selector}")
                        break
                except Exception:
                    continue

            if not connect_button:
                # Check if already connected
                if await page.locator('button:has-text("Message"):visible').count() > 0:
                    debug_log.append("User appears to be already connected (Message button found)")
                    return {
                        "success": True,
                        "message": "Already connected",
                        "status": "connected",
                        "debug_log": debug_log
                    }

                # Check if connection pending
                pending_selectors = [
                    'button:has-text("Pending"):visible',
                    'button[aria-label*="pending"]:visible',
                ]
                for selector in pending_selectors:
                    if await page.locator(selector).count() > 0:
                        debug_log.append("Connection request already pending")
                        return {
                            "success": True,
                            "message": "Connection already pending",
                            "status": "pending",
                            "debug_log": debug_log
                        }

                # Check if there's a "More" dropdown
                more_button = page.locator('button[aria-label="More actions"]:visible, button:has-text("More"):visible').first
                if await more_button.count() > 0:
                    debug_log.append("Clicking More button to find Connect option...")
                    await more_button.click()
                    await asyncio.sleep(1)

                    # Look for Connect in dropdown
                    dropdown_connect = page.locator('[role="menuitem"]:has-text("Connect"), li:has-text("Connect")').first
                    if await dropdown_connect.count() > 0:
                        connect_button = dropdown_connect
                        debug_log.append("Found Connect in dropdown menu")

            if not connect_button:
                debug_log.append("ERROR: Could not find Connect button")
                # Get page content for debugging
                buttons = await page.locator('button').all_text_contents()
                debug_log.append(f"Buttons on page: {buttons[:10]}")
                return {
                    "success": False,
                    "message": "Could not find Connect button - may already be connected or pending",
                    "status": "unknown",
                    "debug_log": debug_log
                }

            # Click Connect button
            debug_log.append("Clicking Connect button...")
            await connect_button.click()

            # Wait for the modal to appear (LinkedIn's "Add a note?" modal)
            debug_log.append("Waiting for connection modal...")
            try:
                # Wait for the artdeco-modal with send-invite class
                await page.wait_for_selector(
                    'div.artdeco-modal.send-invite, div[role="dialog"]',
                    timeout=10000
                )
                debug_log.append("Modal appeared!")
                await asyncio.sleep(1)  # Let modal fully render
            except Exception as e:
                debug_log.append(f"Modal didn't appear within timeout: {e}")
                # Check if connection was sent directly (some profiles skip the modal)
                await asyncio.sleep(2)

            # Handle the connection modal using exact LinkedIn selectors
            # Try aria-label selectors first (most reliable based on actual HTML)
            send_without_note = page.locator('button[aria-label="Send without a note"]').first
            add_note_button = page.locator('button[aria-label="Add a note"]').first

            # Fallback to text-based selectors
            if await send_without_note.count() == 0:
                send_without_note = page.locator('button:has-text("Send without a note")').first
            if await add_note_button.count() == 0:
                add_note_button = page.locator('button:has-text("Add a note")').first

            debug_log.append(f"Send without note button found: {await send_without_note.count() > 0}")
            debug_log.append(f"Add note button found: {await add_note_button.count() > 0}")

            if note and await add_note_button.count() > 0:
                debug_log.append("Adding personalized note...")
                await add_note_button.click()
                await asyncio.sleep(1)

                # Find and fill the note textarea
                note_input = page.locator('textarea[name="message"], textarea#custom-message, textarea').first
                if await note_input.count() > 0:
                    await note_input.fill(note[:300])
                    debug_log.append(f"Note added: {note[:50]}...")

                # Click Send button in the note modal
                send_button = page.locator('button[aria-label="Send invitation"], button:has-text("Send")').last
                if await send_button.count() > 0:
                    await send_button.click()
                    debug_log.append("Clicked Send with note")

            elif await send_without_note.count() > 0:
                # Send without adding a note - this is the primary path
                debug_log.append("Clicking 'Send without a note'...")
                await send_without_note.click()
                debug_log.append("Clicked Send without note")

            else:
                # Try any visible Send button as fallback
                send_button = page.locator('button:has-text("Send"):visible').first
                if await send_button.count() > 0:
                    await send_button.click()
                    debug_log.append("Clicked generic Send button")
                else:
                    debug_log.append("No send button found - connection may have been sent directly")

            await asyncio.sleep(3)  # Wait for action to complete

            # Verify the connection was sent
            # Check for success indicators
            if await page.locator('button:has-text("Pending"):visible').count() > 0:
                debug_log.append("SUCCESS: Connection request sent (Pending button visible)")
                return {
                    "success": True,
                    "message": "Connection request sent successfully",
                    "status": "pending",
                    "debug_log": debug_log
                }

            # Check for any error messages
            error_msg = page.locator('[role="alert"], .artdeco-inline-feedback--error').first
            if await error_msg.count() > 0:
                error_text = await error_msg.text_content()
                debug_log.append(f"Error message found: {error_text}")
                return {
                    "success": False,
                    "message": f"LinkedIn error: {error_text}",
                    "status": "error",
                    "debug_log": debug_log
                }

            # If Connect button is no longer visible, assume success
            if await page.locator('button:has-text("Connect"):visible').count() == 0:
                debug_log.append("Connect button no longer visible - likely successful")
                return {
                    "success": True,
                    "message": "Connection request appears to be sent",
                    "status": "pending",
                    "debug_log": debug_log
                }

            debug_log.append("Uncertain outcome - please verify manually")
            return {
                "success": True,  # Optimistically assume success
                "message": "Connection request may have been sent",
                "status": "unknown",
                "debug_log": debug_log
            }

        except LinkedInBrowserAuthError:
            raise
        except Exception as e:
            debug_log.append(f"Exception: {str(e)}")
            logger.error(f"Browser connection request failed: {e}")
            return {
                "success": False,
                "message": str(e),
                "status": "error",
                "debug_log": debug_log
            }
        finally:
            await page.close()

    async def check_connection_status(self, person_url: str, timeout: int = 20000) -> str:
        """
        Check connection status by visiting profile page.

        Returns: "connected", "pending", "notConnected", or "unknown"
        """
        public_id = self._extract_public_id(person_url)
        profile_url = f"https://www.linkedin.com/in/{public_id}/"

        context = await self._get_context()
        page = await context.new_page()

        try:
            await page.goto(profile_url, wait_until='domcontentloaded', timeout=timeout)
            await asyncio.sleep(2)

            # Check if logged in
            if await page.locator('button:has-text("Sign in")').count() > 0:
                await self._mark_cookies_invalid("Not authenticated")
                raise LinkedInBrowserAuthError("Not logged in")

            # Check for Message button (indicates connected)
            if await page.locator('button:has-text("Message"):visible').count() > 0:
                # Verify it's not just InMail option
                if await page.locator('button:has-text("Connect"):visible').count() == 0:
                    return "connected"

            # Check for Pending button
            if await page.locator('button:has-text("Pending"):visible').count() > 0:
                return "pending"

            # Check for Connect button
            if await page.locator('button:has-text("Connect"):visible').count() > 0:
                return "notConnected"

            # Check More dropdown
            more_button = page.locator('button[aria-label="More actions"]:visible').first
            if await more_button.count() > 0:
                await more_button.click()
                await asyncio.sleep(1)

                if await page.locator('[role="menuitem"]:has-text("Connect")').count() > 0:
                    return "notConnected"

            return "unknown"

        except LinkedInBrowserAuthError:
            raise
        except Exception as e:
            logger.error(f"Browser connection check failed: {e}")
            return "unknown"
        finally:
            await page.close()
