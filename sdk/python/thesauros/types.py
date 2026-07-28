"""Type definitions for the Thesauros Developer Platform API v1.

These :class:`~typing.TypedDict` definitions mirror the API contract one-to-one
(see ``spec/developer-platform-architecture.md``, section 4). Field names use the
API's native ``snake_case`` so SDK objects are wire-identical to the JSON
returned by the service.

At runtime, resource methods return plain ``dict`` / ``list`` objects parsed from
JSON; these TypedDicts exist purely for static type checking.
"""

from typing import Any, Dict, List, Optional, TypedDict

# ---------------------------------------------------------------------------
# Shared enums (documented as literal unions for reference; the wire format is
# plain strings, so fields are typed as ``str`` for forward compatibility).
# ---------------------------------------------------------------------------
#
# Environment        = "test" | "live"
# Asset              = "USDC" | "USDT"
# Chain              = "base" | "arbitrum"
# VaultProvider      = "aave" | "morpho" | "compound" | "dolomite" | "treasury"
# RiskTier           = "bluechip" | "core" | "opportunistic"
# VaultStatus        = "active" | "paused"
# PositionStatus     = "active" | "closed"   (sandbox settles synchronously)
# PositionEventType  = "deposit" | "rebalance" | "accrual" | "withdraw" | "close"
# RebalanceReason    = "yield_optimization" | "risk_adjustment" | "capacity_rebalance"
# WebhookEventType   = "position.opened" | "position.active" | "position.rebalanced"
#                    | "position.withdrawn" | "position.closed" | "yield.threshold"
#                    | "system.status"
# DeliveryStatus     = "delivered" | "failed"
# UsageRange         = "24h" | "7d" | "30d"
# ComponentStatus    = "operational" | "degraded" | "partial_outage" | "major_outage"
# UserStatus         = "active" | "disabled"
# LedgerEntryType    = "deposit" | "withdraw" | "close" | "accrual"
# ReconciliationStatus = "reconciled" | "mismatch"


# ---------------------------------------------------------------------------
# 4.1 Keys
# ---------------------------------------------------------------------------
class ApiKey(TypedDict):
    """An API key.

    The full ``secret`` is returned in plaintext ONLY by
    :meth:`KeysResource.create`; list responses mask it (``tsk_test_...a1b2``).
    """

    id: str
    object: str
    label: str
    secret: str
    prefix: str
    environment: str  # "test" | "live"
    created_at: str
    last_used_at: Optional[str]
    revoked: bool
    scopes: List[str]


class RevokedKey(TypedDict):
    """Result of revoking a key: ``DELETE /keys/:id`` -> ``{id, revoked: true}``."""

    id: str
    revoked: bool


# ---------------------------------------------------------------------------
# 4.2 Vaults
# ---------------------------------------------------------------------------
class Vault(TypedDict):
    """A yield vault across a lending provider.

    All ``apy*`` fields and ``allocation_pct`` are decimal fractions
    (``0.0642`` == 6.42%, ``0.28`` == 28%).
    """

    id: str
    object: str
    name: str
    provider: str  # aave | morpho | compound | dolomite | treasury
    asset: str  # USDC | USDT
    chain: str  # base | arbitrum
    apy: float  # decimal fraction (0.0642 == 6.42%)
    apy_7d_avg: float  # decimal fraction
    apy_30d_avg: float  # decimal fraction
    tvl_usd: float
    capacity_usd: float
    risk_tier: str  # bluechip | core | opportunistic
    status: str  # active | paused
    inception_date: str
    description: str
    allocation_pct: float  # decimal fraction (0.28 == 28%)


# ---------------------------------------------------------------------------
# 4.3 Yield
# ---------------------------------------------------------------------------
class YieldBreakdown(TypedDict):
    """Per-vault contribution to a blended yield figure."""

    vault_id: str
    name: str
    provider: str
    apy: float  # decimal fraction (0.0642 == 6.42%)
    allocation: float  # decimal fraction (0.28 == 28%)


class YieldHistoryPoint(TypedDict):
    """A single point in a yield history series."""

    t: int  # Unix epoch timestamp in milliseconds
    apy: float  # decimal fraction


class Yield(TypedDict):
    """Aggregated yield for an asset.

    ``GET /yield`` returns the aggregated view; ``GET /yield/:asset`` returns
    per-asset detail with ``breakdown`` and ``history``. All ``*_apy`` fields
    are decimal fractions (``0.0642`` == 6.42%).
    """

    object: str
    asset: str
    best_apy: float
    blend_apy: float
    blended_30d: float
    breakdown: List[YieldBreakdown]
    history: List[YieldHistoryPoint]


# ---------------------------------------------------------------------------
# 4.4 Positions
# ---------------------------------------------------------------------------
class Position(TypedDict):
    """A deployed yield position."""

    id: str
    object: str
    wallet: str
    asset: str
    chain: str
    vault_id: str
    strategy: str
    principal: float
    current_value: float
    accrued_yield: float
    apy: float  # decimal fraction (0.0642 == 6.42%)
    status: str  # active | closed
    opened_at: str
    updated_at: str
    last_rebalance_at: Optional[str]
    tx_hash: Optional[str]


class PositionEvent(TypedDict):
    """A single entry in a position's history log."""

    id: str
    type: str  # deposit | rebalance | accrual | withdraw | close
    at: str  # ISO-8601 timestamp
    amount: float
    apy: float
    vault_id: str
    note: Optional[str]


# ---------------------------------------------------------------------------
# 4.5 Rebalances
# ---------------------------------------------------------------------------
class Rebalance(TypedDict):
    """A movement of funds between two vaults for a position."""

    id: str
    object: str
    position_id: str
    from_vault: str
    to_vault: str
    amount: float
    reason: str  # yield_optimization | risk_adjustment | capacity_rebalance
    apy_before: float
    apy_after: float
    at: str  # ISO-8601 timestamp
    tx_hash: Optional[str]


# ---------------------------------------------------------------------------
# 4.6 Webhooks
# ---------------------------------------------------------------------------
class Webhook(TypedDict):
    """A registered webhook endpoint."""

    id: str
    object: str
    url: str
    events: List[str]
    secret: str  # whsec_...
    active: bool
    created_at: str


class Delivery(TypedDict):
    """A single webhook delivery attempt (also the event-log entry shape)."""

    id: str
    webhook_id: str
    url: str  # target endpoint URL
    event: str
    payload: Dict[str, Any]
    signature: str
    status: str  # delivered | failed
    attempts: int
    at: str  # ISO-8601 timestamp
    latency_ms: float


class DeletionResult(TypedDict, total=False):
    """The unwrapped body of ``DELETE /webhooks/:id``.

    The contract guarantees the deleted ``id``; additional fields are tolerated.
    """

    id: str


# ---------------------------------------------------------------------------
# 4.7 Usage
# ---------------------------------------------------------------------------
class UsageTotals(TypedDict):
    """Aggregate totals for a usage range."""

    requests: int
    errors: int
    p50_ms: float
    p99_ms: float
    unique_keys: int


class UsageSeriesPoint(TypedDict):
    """A single point in the usage time series."""

    t: int  # Unix epoch timestamp in milliseconds
    requests: int
    errors: int
    p50_ms: float
    p99_ms: float


class Usage(TypedDict):
    """API usage telemetry."""

    object: str
    range: str  # 24h | 7d | 30d
    totals: UsageTotals
    series: List[UsageSeriesPoint]


# ---------------------------------------------------------------------------
# 4.8 Status
# ---------------------------------------------------------------------------
class StatusComponent(TypedDict):
    """Health of a single platform component."""

    id: str
    name: str
    status: str  # operational | degraded | partial_outage | major_outage
    uptime_90d: float
    latency_ms: float


class Incident(TypedDict, total=False):
    """A past or ongoing incident.

    The contract does not fix the incident schema; these are the conventional
    minimum fields and extra fields are tolerated.
    """

    id: str
    title: str
    status: str
    started_at: str
    resolved_at: Optional[str]


class Status(TypedDict):
    """Overall platform health."""

    object: str
    overall: str  # operational | degraded | partial_outage | major_outage
    components: List[StatusComponent]
    incidents: List[Incident]
    updated_at: str


# ---------------------------------------------------------------------------
# 4.9 Users
# ---------------------------------------------------------------------------
class User(TypedDict):
    """A platform user.

    Maps to one or more wallets and an external identifier in the caller's own
    system.
    """

    id: str
    object: str
    external_id: str  # the caller's own unique identifier for this user
    label: Optional[str]
    email: Optional[str]
    metadata: Dict[str, Any]
    wallets: List[str]
    status: str  # active | disabled
    created_at: str
    updated_at: str


class LedgerEntry(TypedDict):
    """A single ledger entry recording a signed movement of funds.

    ``amount`` is signed (deposits/accruals positive, withdrawals/closes
    negative).
    """

    id: str
    object: str
    at: str  # ISO-8601 timestamp
    user_id: Optional[str]
    position_id: str
    wallet: str
    asset: str
    type: str  # deposit | withdraw | close | accrual
    amount: float  # signed
    balance_after: float
    vault_id: str
    settled: bool
    ref: str


# ---------------------------------------------------------------------------
# 4.10 Reconciliation
# ---------------------------------------------------------------------------
class Balance(TypedDict):
    """An aggregated balance for a user (or the whole platform) and asset."""

    object: str
    user_id: Optional[str]
    asset: str
    principal: float
    current_value: float
    accrued_yield: float
    positions: int  # number of positions contributing to this balance


class ReconciliationBreakdown(TypedDict):
    """Per-asset contribution to a reconciliation result."""

    asset: str
    recorded: float
    onchain: float
    discrepancy: float


class Reconciliation(TypedDict):
    """The result of comparing recorded balances against on-chain balances.

    All monetary fields are in the asset's native units; ``tolerance`` is the
    threshold within which a ``discrepancy`` is still considered ``reconciled``.
    """

    object: str
    as_of: str  # ISO-8601 timestamp
    scope: str
    recorded_total: float
    onchain_total: float
    discrepancy: float
    unsettled_yield: float
    tolerance: float
    status: str  # reconciled | mismatch
    positions: int  # number of positions included
    breakdown: List[ReconciliationBreakdown]


class BalanceSnapshot(TypedDict):
    """A point-in-time snapshot of platform balances."""

    object: str
    date: str  # calendar date (YYYY-MM-DD)
    t: int  # Unix epoch timestamp in milliseconds
    principal: float
    value: float
    accrued: float
    positions: int  # number of positions at snapshot time
    users: int  # number of users at snapshot time
    by_asset: List[Dict[str, Any]]
