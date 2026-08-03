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


# ---------------------------------------------------------------------------
# 4.11 Analytics
# ---------------------------------------------------------------------------
# SignalRecommendation = "overweight" | "neutral" | "underweight"
# MarketRegime         = "rising" | "falling" | "stable" | "volatile"
# DecisionType         = "initial_routing" | "rebalance"


class Signal(TypedDict):
    """A per-vault yield signal.

    All ``*_apy`` fields, ``volatility``, and ``risk_factor`` are decimal
    fractions (``0.0642`` == 6.42%); ``trend_slope_bps_day`` is a slope in basis
    points per day.
    """

    object: str
    vault_id: str
    name: str
    provider: str  # aave | morpho | compound | dolomite | treasury
    asset: str  # USDC | USDT
    chain: str  # base | arbitrum
    risk_tier: str  # bluechip | core | opportunistic
    apy: float  # decimal fraction (0.0642 == 6.42%)
    volatility: float  # decimal fraction
    trend_slope_bps_day: float  # basis points per day
    forecast_apy: float  # decimal fraction
    risk_factor: float  # multiplicative risk factor
    risk_adjusted_apy: float  # decimal fraction
    rank: int  # rank across all vaults (1 = best)
    recommendation: str  # overweight | neutral | underweight


class RegimeAsset(TypedDict):
    """Per-asset contribution to a market regime report."""

    asset: str
    regime: str  # rising | falling | stable | volatile
    blend_apy: float  # decimal fraction (0.0642 == 6.42%)
    trend_slope_bps_day: float  # basis points per day
    volatility: float  # decimal fraction


class Regime(TypedDict):
    """The current market regime and its per-asset breakdown."""

    object: str
    as_of: str  # ISO-8601 timestamp
    regime: str  # rising | falling | stable | volatile
    description: str
    per_asset: List[RegimeAsset]


class UpliftTotals(TypedDict):
    """Aggregate totals for an uplift report."""

    principal: float
    current_value: float
    aave_baseline: float
    hold_baseline: float
    uplift_vs_aave: float
    uplift_vs_hold: float
    uplift_vs_aave_pct: float  # decimal fraction (0.0006 == 0.06%)


class UpliftRow(TypedDict):
    """A single position's contribution to an uplift report."""

    object: str
    position_id: str
    user_id: Optional[str]
    asset: str
    vault_id: str
    principal: float
    current_value: float
    apy: float  # decimal fraction (0.0642 == 6.42%)
    aave_baseline: float
    baseline_apy: float  # decimal fraction
    hold_baseline: float
    uplift_vs_aave: float
    uplift_vs_hold: float


class UpliftReport(TypedDict):
    """A comparison of routed portfolio value against passive baselines.

    Compares against the Aave-only and hold baselines. All monetary fields are
    in the asset's native units; ``uplift_vs_aave_pct`` is a decimal fraction.
    """

    object: str
    as_of: str  # ISO-8601 timestamp
    scope: str
    totals: UpliftTotals
    positions: List[UpliftRow]


class DecisionAlternative(TypedDict):
    """A vault considered alongside a routing decision."""

    vault_id: str
    name: str
    provider: str
    apy: float  # decimal fraction (0.0642 == 6.42%)
    risk_tier: str


class Decision(TypedDict):
    """A single routing/rebalance decision with its rationale."""

    object: str
    id: str
    at: str  # ISO-8601 timestamp
    position_id: str
    user_id: Optional[str]
    asset: str
    type: str  # initial_routing | rebalance
    from_vault: Optional[str]
    to_vault: str
    apy_before: Optional[float]  # decimal fraction (null for initial routing)
    apy_after: float  # decimal fraction
    expected_uplift_bps: Optional[float]  # basis points (null when n/a)
    reason: Optional[str]  # may be absent on the wire
    alternatives: List[DecisionAlternative]
    rationale: str
    status: str


class AdvisorOpportunity(TypedDict):
    """A top opportunity surfaced by the advisor."""

    vault_id: str
    name: str
    asset: str
    risk_adjusted_apy: float  # decimal fraction (0.0642 == 6.42%)
    forecast_apy: float  # decimal fraction
    recommendation: str  # overweight | neutral | underweight


class AdvisorPortfolio(TypedDict):
    """Portfolio summary embedded in the advisor report."""

    current_value: float
    uplift_vs_aave: float
    uplift_vs_aave_pct: float  # decimal fraction
    positions: int  # number of positions in the portfolio


class Advisor(TypedDict):
    """A human-readable advisory.

    Summarizes the regime, top opportunities, and portfolio.
    """

    object: str
    as_of: str  # ISO-8601 timestamp
    headline: str
    regime: str  # rising | falling | stable | volatile
    bullets: List[str]
    top_opportunities: List[AdvisorOpportunity]
    portfolio: AdvisorPortfolio
    disclaimer: str


# --------------------------------------------------------------------------- #
# Backtesting / PSO
# --------------------------------------------------------------------------- #

# BacktestStrategy = "aave-only" | "best-apy" | "risk-adjusted-pso"


class PsoAllocationItem(TypedDict):
    """A vault's allocation weight in a PSO result."""

    vault_id: str
    name: str
    asset: str
    risk_tier: str
    weight: float  # 0-1
    risk_adjusted_apy: float  # decimal fraction (0.0642 == 6.42%)


class PsoAllocation(TypedDict):
    """Response of ``GET /analytics/pso``."""

    object: str
    asset: str
    expected_return: float  # risk-adjusted, decimal fraction
    iterations: int
    particles: int
    converged: bool
    allocations: List[PsoAllocationItem]


class BacktestPoint(TypedDict):
    """A point on a backtest equity curve."""

    t: int  # epoch ms
    value: float


# `Backtest` and `BacktestComparison` carry a literal `from` key, which is a
# Python keyword and illegal in class-syntax TypedDicts, so they use the
# functional syntax to stay wire-identical.
Backtest = TypedDict(
    "Backtest",
    {
        "object": str,
        "strategy": str,  # aave-only | best-apy | risk-adjusted-pso
        "asset": str,
        "from": str,  # ISO-8601 timestamp
        "to": str,  # ISO-8601 timestamp
        "days": int,
        "principal": float,
        "final_value": float,
        "total_return_pct": float,  # percentage points
        "apy": float,  # decimal fraction
        "volatility_pct": float,  # annualized, percentage points
        "max_drawdown_pct": float,  # percentage points
        "rebalances": int,
        "series": List[BacktestPoint],
    },
)


class BacktestStrategyRow(TypedDict):
    """One strategy's summary row in a comparison."""

    strategy: str
    final_value: float
    total_return_pct: float
    apy: float
    volatility_pct: float
    max_drawdown_pct: float
    rebalances: int
    uplift_vs_baseline: float  # monetary, vs the aave-only baseline


class BacktestComparisonSeries(TypedDict):
    """A strategy's equity curve in a comparison."""

    strategy: str
    points: List[BacktestPoint]


BacktestComparison = TypedDict(
    "BacktestComparison",
    {
        "object": str,
        "asset": str,
        "from": str,  # ISO-8601 timestamp
        "to": str,  # ISO-8601 timestamp
        "principal": float,
        "baseline": str,
        "strategies": List[BacktestStrategyRow],
        "series": List[BacktestComparisonSeries],
    },
)
