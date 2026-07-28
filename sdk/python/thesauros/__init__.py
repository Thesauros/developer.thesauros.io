"""thesauros — official Python SDK for the Thesauros Developer Platform.

Example::

    from thesauros import Thesauros

    client = Thesauros(api_key="tsk_test_...")
    vaults = client.vaults.list(asset="USDC")
    rates = client.yield_.get("USDC")

See the ``README.md`` for the full resource reference and webhook verification.
"""

from .client import (
    KeysResource,
    PositionsResource,
    RebalancesResource,
    StatusResource,
    Thesauros,
    UsageResource,
    VaultsResource,
    WebhooksResource,
    YieldResource,
)
from .errors import ApiError, NetworkError, RateLimitError, ThesaurosError
from .webhooks import verify_signature

__version__ = "1.0.0"

__all__ = [
    "Thesauros",
    "KeysResource",
    "VaultsResource",
    "YieldResource",
    "PositionsResource",
    "RebalancesResource",
    "WebhooksResource",
    "UsageResource",
    "StatusResource",
    "ThesaurosError",
    "ApiError",
    "RateLimitError",
    "NetworkError",
    "verify_signature",
    "__version__",
]
