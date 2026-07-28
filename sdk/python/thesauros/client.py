"""The :class:`Thesauros` client and its namespaced resource objects.

Each resource mirrors a group of API endpoints one-to-one, using snake_case
method names. Resource methods return the unwrapped envelope ``data`` directly;
envelope ``meta``, the request id, and rate-limit headers from the most recent
call are available on ``client.last_response`` (and ``client.last_meta``).
"""

from typing import Any, List, Optional
from urllib.parse import quote

from ._http import HttpClient
from .types import (
    ApiKey,
    DeletionResult,
    Delivery,
    Position,
    PositionEvent,
    Rebalance,
    RevokedKey,
    Status,
    Usage,
    Vault,
    Webhook,
    Yield,
)


def _enc(segment: str) -> str:
    """Percent-encode a single path segment (no ``/`` passthrough)."""
    return quote(str(segment), safe="")


class KeysResource:
    """API key management (``/keys``)."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def create(self, label: str) -> ApiKey:
        """Create a new API key.

        The full ``secret`` is returned in plaintext ONLY here; subsequent list
        calls mask it. Store it immediately.
        """
        return self._http.request("POST", "keys", body={"label": label})

    def list(self) -> List[ApiKey]:
        """List all keys. Secrets are masked (e.g. ``tsk_test_...a1b2``)."""
        return self._http.request("GET", "keys")

    def revoke(self, id: str) -> RevokedKey:  # noqa: A002 - mirrors the API field name
        """Revoke a key by id. Returns ``{"id", "revoked": True}``."""
        return self._http.request("DELETE", f"keys/{_enc(id)}")


class VaultsResource:
    """Yield vault discovery (``/vaults``)."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def list(
        self,
        asset: Optional[str] = None,
        chain: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[Vault]:
        """List vaults, optionally filtered by ``asset``, ``chain``, and/or ``status``."""
        return self._http.request(
            "GET", "vaults", query={"asset": asset, "chain": chain, "status": status}
        )

    def retrieve(self, id: str) -> Vault:  # noqa: A002 - mirrors the API field name
        """Retrieve a single vault by id."""
        return self._http.request("GET", f"vaults/{_enc(id)}")


class YieldResource:
    """Aggregated yield rates (``/yield``).

    Exposed on the client as ``client.yield_`` and ``client.rates`` (``yield`` is
    a Python keyword and cannot be used as an attribute name).
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def get(self, asset: Optional[str] = None) -> Yield:
        """Fetch yield rates.

        - With no argument: ``GET /yield`` — the aggregated best/blend view.
        - With an ``asset``: ``GET /yield/:asset`` — per-asset detail with a
          per-vault ``breakdown`` and ``history``.
        """
        if asset is not None:
            return self._http.request("GET", f"yield/{_enc(asset)}")
        return self._http.request("GET", "yield")


class PositionsResource:
    """Deployed yield positions (``/positions``)."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def create(
        self,
        wallet: str,
        asset: str,
        amount: float,
        strategy: Optional[str] = None,
    ) -> Position:
        """Open a new position.

        ``strategy`` defaults to ``"auto"`` server-side; pass a ``vault_id`` to
        pin the position to a specific vault.
        """
        body = {"wallet": wallet, "asset": asset, "amount": amount}
        if strategy is not None:
            body["strategy"] = strategy
        return self._http.request("POST", "positions", body=body)

    def list(
        self,
        wallet: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[Position]:
        """List positions, optionally filtered by ``wallet`` and/or ``status``."""
        return self._http.request(
            "GET", "positions", query={"wallet": wallet, "status": status}
        )

    def retrieve(self, id: str) -> Position:  # noqa: A002 - mirrors the API field name
        """Retrieve a single position by id, with live accrued yield."""
        return self._http.request("GET", f"positions/{_enc(id)}")

    def withdraw(
        self,
        id: str,  # noqa: A002 - mirrors the API field name
        amount: Optional[float] = None,
        all: Optional[bool] = None,  # noqa: A001,A002 - mirrors the API field name
    ) -> Position:
        """Withdraw from a position.

        Pass ``amount`` for a partial withdrawal or ``all=True`` to close it out
        entirely.
        """
        body: dict = {}
        if amount is not None:
            body["amount"] = amount
        if all is not None:
            body["all"] = all
        return self._http.request("POST", f"positions/{_enc(id)}/withdraw", body=body)

    def history(self, id: str) -> List[PositionEvent]:  # noqa: A002 - mirrors the API field name
        """Retrieve the event history for a position."""
        return self._http.request("GET", f"positions/{_enc(id)}/history")


class RebalancesResource:
    """Rebalance activity (``/rebalances``)."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def list(self, position_id: Optional[str] = None) -> List[Rebalance]:
        """List rebalances, optionally scoped to a single ``position_id``."""
        return self._http.request("GET", "rebalances", query={"position_id": position_id})


class WebhooksResource:
    """Webhook endpoint management (``/webhooks``)."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def create(self, url: str, events: List[str]) -> Webhook:
        """Register a webhook endpoint subscribed to the given ``events``."""
        return self._http.request("POST", "webhooks", body={"url": url, "events": events})

    def list(self) -> List[Webhook]:
        """List registered webhook endpoints."""
        return self._http.request("GET", "webhooks")

    def delete(self, id: str) -> DeletionResult:  # noqa: A002 - mirrors the API field name
        """Delete a webhook endpoint by id."""
        return self._http.request("DELETE", f"webhooks/{_enc(id)}")

    def test(self, id: str) -> Delivery:  # noqa: A002 - mirrors the API field name
        """Dispatch a synthetic test event to the endpoint; returns the delivery record."""
        return self._http.request("POST", f"webhooks/{_enc(id)}/test")

    def events(self, webhook_id: Optional[str] = None) -> List[Delivery]:
        """Retrieve the delivery event log, optionally filtered by ``webhook_id``."""
        return self._http.request("GET", "webhooks/events", query={"webhook_id": webhook_id})


class UsageResource:
    """API usage telemetry (``/usage``)."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def get(self, range: Optional[str] = None) -> Usage:  # noqa: A002 - mirrors the API field name
        """Fetch usage telemetry for a ``range`` (``24h`` | ``7d`` | ``30d``)."""
        return self._http.request("GET", "usage", query={"range": range})


class StatusResource:
    """Platform health (``/status``)."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def get(self) -> Status:
        """Fetch overall platform health, component status, and incidents."""
        return self._http.request("GET", "status")


class Thesauros:
    """Thesauros Developer Platform API client.

    Example::

        from thesauros import Thesauros

        client = Thesauros(api_key="tsk_test_...")  # sandbox default
        client.vaults.list(asset="USDC")
        client.yield_.get("USDC")
        pos = client.positions.create(wallet="0xabc...", asset="USDC", amount=1000)
        client.positions.withdraw(pos["id"], all=True)
        client.webhooks.create(url="https://example.com/hook", events=["position.rebalanced"])

    Args:
        api_key: API secret key (``tsk_test_...`` or ``tsk_live_...``). Required.
        base_url: API base URL. Defaults to ``https://developer.thesauros.io/api/v1``.
        timeout: Per-request timeout in seconds. Defaults to ``30.0``.
        max_retries: Maximum retries for ``429``/``5xx`` responses. Defaults to ``3``.
    """

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self._http = HttpClient(api_key, base_url=base_url, timeout=timeout, max_retries=max_retries)
        self.keys = KeysResource(self._http)
        self.vaults = VaultsResource(self._http)
        # ``yield`` is a Python keyword, so the resource is exposed as ``yield_``
        # with a ``rates`` alias. Both reference the same object.
        self.yield_ = YieldResource(self._http)
        self.rates = self.yield_
        self.positions = PositionsResource(self._http)
        self.rebalances = RebalancesResource(self._http)
        self.webhooks = WebhooksResource(self._http)
        self.usage = UsageResource(self._http)
        self.status = StatusResource(self._http)

    @property
    def last_response(self) -> Any:
        """Metadata (status, object, meta, request id, rate limits) from the last call."""
        return self._http.last_response

    @property
    def last_meta(self) -> Optional[dict]:
        """Convenience accessor for the envelope ``meta`` of the last call, if any."""
        lr = self._http.last_response
        return lr.meta if lr is not None else None
