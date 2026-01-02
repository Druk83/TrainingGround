"""
Feature Flags integration examples for Python services.

This module demonstrates how to use feature flags in Python services like
Explanation Builder and Template Generator.
"""

import os
import httpx
from typing import Optional, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class FeatureFlagClient:
    """
    Client for checking feature flags in Python services.
    
    Example:
        >>> client = FeatureFlagClient(
        ...     api_url="http://localhost:3000",
        ...     user_id="user_123",
        ...     group_id="group_456"
        ... )
        >>> if client.is_enabled("explanation_yandexgpt_enabled"):
        ...     # Use YandexGPT API
        ...     result = yandex_gpt_api.generate(prompt)
        ... else:
        ...     # Fallback to template-based explanations
        ...     result = template_engine.generate(prompt)
    """

    def __init__(
        self,
        api_url: str = "http://localhost:3000",
        user_id: Optional[str] = None,
        group_id: Optional[str] = None,
        cache_ttl: int = 60,
    ):
        """
        Initialize feature flag client.
        
        Args:
            api_url: Base URL of TrainingGround API
            user_id: Current user ID (for user-scoped flags)
            group_id: Current group ID (for group-scoped flags)
            cache_ttl: Cache TTL in seconds (local caching)
        """
        self.api_url = api_url.rstrip("/")
        self.user_id = user_id
        self.group_id = group_id
        self.cache_ttl = cache_ttl
        self._cache: Dict[str, tuple[bool, datetime]] = {}
        self._flags: Optional[Dict[str, Any]] = None

    async def is_enabled(self, flag_key: str) -> bool:
        """
        Check if flag is enabled for current user/group context.
        
        Args:
            flag_key: Flag identifier (e.g., "explanation_yandexgpt_enabled")
            
        Returns:
            True if flag is enabled, False otherwise
            
        Raises:
            httpx.RequestError: If API request fails
        """
        # Check local cache first
        if flag_key in self._cache:
            value, timestamp = self._cache[flag_key]
            if (datetime.now() - timestamp).seconds < self.cache_ttl:
                logger.debug(f"Flag '{flag_key}' from cache: {value}")
                return value

        # Fetch flags from API
        flags = await self._fetch_flags()
        if flags is None:
            logger.warning(f"Failed to fetch flags, defaulting '{flag_key}' to False")
            return False
        
        # Find flag in response
        for flag in flags.get("flags", []):
            if flag.get("flag_key") == flag_key:
                enabled = flag.get("enabled", False)
                self._cache[flag_key] = (enabled, datetime.now())
                logger.info(f"Flag '{flag_key}' resolved to: {enabled}")
                return enabled

        # Flag not found, default to False
        logger.warning(f"Flag '{flag_key}' not found in response, defaulting to False")
        self._cache[flag_key] = (False, datetime.now())
        return False

    async def get_flag_config(self, flag_key: str) -> Dict[str, Any]:
        """
        Get flag configuration as dictionary.
        
        Args:
            flag_key: Flag identifier
            
        Returns:
            Configuration dictionary for the flag
        """
        flags = await self._fetch_flags()
        if flags is None:
            return {}
        
        for flag in flags.get("flags", []):
            if flag.get("flag_key") == flag_key:
                return flag.get("config", {})
        
        return {}

    async def _fetch_flags(self) -> Optional[Dict[str, Any]]:
        """
        Fetch all active flags for current context from API.
        """
        if self._flags is not None:
            return self._flags

        params = {}
        if self.user_id:
            params["user_id"] = self.user_id
        if self.group_id:
            params["group_id"] = self.group_id

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/api/feature-flags",
                    params=params,
                    timeout=5.0,
                )
                response.raise_for_status()
                self._flags = response.json()
                logger.debug(f"Fetched flags from API: {self._flags}")
                return self._flags
        except httpx.RequestError as e:
            logger.error(f"Failed to fetch feature flags: {e}")
            raise


# =============================================================================
# Example: Explanation Builder Service
# =============================================================================

class ExplanationBuilder:
    """
    Example explanation builder service that uses feature flags.
    """

    def __init__(
        self,
        user_id: Optional[str] = None,
        group_id: Optional[str] = None,
    ):
        """Initialize explanation builder with feature flag support."""
        self.flag_client = FeatureFlagClient(user_id=user_id, group_id=group_id)

    async def generate_explanation(self, task_id: str, user_answer: str) -> str:
        """
        Generate explanation for a task.
        
        Uses YandexGPT if enabled, otherwise returns template-based explanation.
        
        Args:
            task_id: Task identifier
            user_answer: User's answer to task
            
        Returns:
            Explanation text
        """
        # Check if explanations are enabled at all
        if not await self.flag_client.is_enabled("explanation_api_enabled"):
            logger.info("Explanation API is disabled")
            return "Explanations are currently unavailable"

        # Check if YandexGPT is enabled
        if await self.flag_client.is_enabled("explanation_yandexgpt_enabled"):
            return await self._generate_with_yandex_gpt(task_id, user_answer)
        else:
            return self._generate_from_template(task_id, user_answer)

    async def _generate_with_yandex_gpt(self, task_id: str, user_answer: str) -> str:
        """Generate explanation using YandexGPT API."""
        config = await self.flag_client.get_flag_config("explanation_yandexgpt_enabled")
        
        # Extract config parameters
        model = config.get("model", "yandexgpt-3")
        temperature = config.get("temperature", 0.7)
        max_tokens = config.get("max_tokens", 500)
        
        logger.info(f"Generating explanation with {model}, temp={temperature}")
        
        # TODO: Implement YandexGPT API call
        # This is where you would call the YandexGPT API with the config
        
        return f"Explanation for task {task_id} using {model}"

    def _generate_from_template(self, task_id: str, user_answer: str) -> str:
        """Generate explanation from template."""
        logger.info(f"Generating template-based explanation for task {task_id}")
        return f"Template explanation for task {task_id}"


# =============================================================================
# Example: Template Generator Service
# =============================================================================

class TemplateGenerator:
    """
    Example template generator service that uses feature flags.
    """

    def __init__(
        self,
        user_id: Optional[str] = None,
        group_id: Optional[str] = None,
    ):
        """Initialize template generator with feature flag support."""
        self.flag_client = FeatureFlagClient(user_id=user_id, group_id=group_id)

    async def generate_template(self, level_id: str, user_performance: float) -> dict:
        """
        Generate template for a level.
        
        Uses adaptive generation if enabled, otherwise fixed templates.
        
        Args:
            level_id: Level identifier
            user_performance: User's current performance score (0-100)
            
        Returns:
            Template dictionary
        """
        # Check if adaptive templates are enabled
        if await self.flag_client.is_enabled("adaptive_templates_enabled"):
            return await self._generate_adaptive_template(level_id, user_performance)
        else:
            return self._generate_fixed_template(level_id)

    async def _generate_adaptive_template(
        self, level_id: str, user_performance: float
    ) -> dict:
        """Generate template with adaptation based on user performance."""
        config = await self.flag_client.get_flag_config("adaptive_templates_enabled")
        
        adaptation_level = config.get("adaptation_level", "medium")
        min_accuracy = config.get("min_accuracy_threshold", 60)
        
        logger.info(
            f"Generating adaptive template for level {level_id}, "
            f"performance={user_performance}, adaptation={adaptation_level}"
        )
        
        # Adjust difficulty based on performance
        if user_performance >= min_accuracy:
            difficulty = "hard"
        elif user_performance >= min_accuracy * 0.75:
            difficulty = "medium"
        else:
            difficulty = "easy"
        
        return {
            "level_id": level_id,
            "difficulty": difficulty,
            "adaptive": True,
            "adaptation_level": adaptation_level,
        }

    def _generate_fixed_template(self, level_id: str) -> dict:
        """Generate fixed template (no adaptation)."""
        logger.info(f"Generating fixed template for level {level_id}")
        return {
            "level_id": level_id,
            "difficulty": "medium",
            "adaptive": False,
        }


# =============================================================================
# Example: Anticheat Service
# =============================================================================

class AnticheatService:
    """
    Example anticheat service that uses feature flags.
    """

    def __init__(self):
        """Initialize anticheat service with feature flag support."""
        self.flag_client = FeatureFlagClient()

    async def check_suspicious_behavior(
        self, 
        user_id: str,
        behavior_type: str,
        details: dict,
    ) -> tuple[bool, str]:
        """
        Check if behavior is suspicious based on anticheat rules.
        
        Args:
            user_id: User ID
            behavior_type: Type of behavior (tab_switch, rapid_submit, etc.)
            details: Behavior details
            
        Returns:
            (is_suspicious, reason)
        """
        # Check if strict mode is enabled
        is_strict = await self.flag_client.is_enabled("anticheat_strict_mode")
        
        if not is_strict:
            logger.info("Anticheat strict mode is disabled")
            return False, "Anticheat disabled"
        
        config = await self.flag_client.get_flag_config("anticheat_strict_mode")
        
        # Check behavior based on type and config
        if behavior_type == "tab_switch":
            threshold = config.get("tab_switch_threshold", 3)
            count = details.get("count", 0)
            
            if count >= threshold:
                return True, f"Tab switches ({count}) exceed threshold ({threshold})"
        
        elif behavior_type == "rapid_submit":
            threshold_ms = config.get("rapid_submit_ms", 500)
            time_spent = details.get("time_spent_ms", 0)
            
            if time_spent < threshold_ms:
                return True, f"Submit too rapid ({time_spent}ms < {threshold_ms}ms)"
        
        logger.info(f"Behavior {behavior_type} is not suspicious")
        return False, "Normal behavior"


# =============================================================================
# Usage Examples
# =============================================================================

async def main():
    """Example usage of feature flag client."""
    
    # Initialize client for specific user and group
    client = FeatureFlagClient(
        user_id="student_123",
        group_id="class_456",
    )
    
    # Check if feature is enabled
    if await client.is_enabled("hints_enabled"):
        print("Hints are enabled for this user")
    
    # Get flag configuration
    config = await client.get_flag_config("anticheat_strict_mode")
    print(f"Anticheat config: {config}")
    
    # Use in explanation builder
    builder = ExplanationBuilder(user_id="student_123")
    explanation = await builder.generate_explanation("task_1", "my_answer")
    print(f"Explanation: {explanation}")
    
    # Use in template generator
    generator = TemplateGenerator(user_id="student_123")
    template = await generator.generate_template("level_1", 85.0)
    print(f"Template: {template}")


if __name__ == "__main__":
    import asyncio
    
    logging.basicConfig(level=logging.DEBUG)
    asyncio.run(main())
