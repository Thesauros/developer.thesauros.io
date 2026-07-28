# thesauros

Official Python SDK for the **Thesauros Developer Platform** — the enterprise B2B
yield-infrastructure API. Typed, dependency-free, and built entirely on the
Python standard library (`urllib` for HTTP, `hmac`/`hashlib` for webhook
verification).

- Full type hints (TypedDicts for every resource and envelope, PEP 561 `py.typed`)
- Namespaced resources that mirror the REST API one-to-one (snake_case methods)
- Automatic retries with exponential backoff + jitter on `429` / `5xx`
- Per-request timeouts, typed errors, rate-limit introspection
- Webhook signature verification (HMAC-SHA256, constant-time)

Requires Python 3.9+. There are **no runtime dependencies**.

## Installation

```bash
pip install thesauros
```

From source:

```bash
cd sdk/python
pip install .
```

## Quickstart

```python
from thesauros import Thesauros

client = Thesauros(api_key="tsk_test_...")   # sandbox default
client.vaults.list(asset="USDC")
client.yield_.get("USDC")
pos = client.positions.create(wallet="0xabc...", asset="USDC", amount=1000)
client.positions.withdraw(pos["id"], all=True)
client.webhooks.create(url="https://example.com/hook", events=["position.rebalanced"])
```

> The shared sandbox bootstrap key is `tsk_test_thesauros_sandbox_0000000000000000`.
> It is test-namespaced and intended only for the sandbox demo — do not ship it
> in production code.

### A note on `yield`

`yield` is a Python keyword, so the yield resource cannot be accessed as
`client.yield`. It is exposed as **`client.yield_`** with a **`client.rates`**
alias — both reference the same object:

```python
client.yield_.get("USDC")   # canonical
client.rates.get("USDC")    # alias, identical result
```

## Configuration

```python
client = Thesauros(
    api_key=os.environ["THESAUROS_API_KEY"],  # required: tsk_test_... or tsk_live_...
    base_url="https://developer.thesauros.io/api/v1",  # optional, this is the default
    timeout=30.0,    # optional, per-request timeout in seconds (default 30.0)
    max_retries=3,   # optional, retries for 429/5xx (default 3)
)
```

## Response shape: unwrapped `data` + `last_response`

Every successful API response is an envelope: `{ "object", "data", "meta"? }`
(single) or `{ "object": "list", "data": [...], "meta": { "total": n } }` (list).
Resource methods return the **unwrapped `data`** directly — plain `dict` / `list`
objects — not envelopes.

Envelope `meta`, the `X-Request-Id`, and rate-limit headers from the most recent
call are recorded on the client:

```python
vaults = client.vaults.list(asset="USDC")
print(len(vaults))                            # list of vault dicts
print(client.last_meta.get("total"))          # list total from meta
print(client.last_response.request_id)        # X-Request-Id
print(client.last_response.rate_limit)        # {"limit", "remaining", "reset"}
```

`last_response` reflects the last completed request on this client instance. If
you share one client across threads, read it immediately after the call you care
about (or use a client per worker).

## Resources

### Keys

```python
key = client.keys.create(label="production-backend")
print(key["secret"])  # shown in full ONLY here — store it now

keys = client.keys.list()              # secrets masked: tsk_test_...a1b2
client.keys.revoke("key_abc123")       # -> {"id", "revoked": True}
```

### Vaults

```python
vaults = client.vaults.list(asset="USDC", chain="base", status="active")
vault = client.vaults.retrieve("vault_abc123")
print(vault["apy"], vault["risk_tier"])
```

### Yield

```python
aggregated = client.yield_.get()          # GET /yield (aggregated view)
detail = client.yield_.get("USDC")        # GET /yield/USDC (per-asset detail)
print(detail["best_apy"], detail["breakdown"], detail["history"])
```

### Positions

```python
pos = client.positions.create(
    wallet="0xabc...",
    asset="USDC",
    amount=1000,
    strategy="auto",        # or a specific vault_id
)

positions = client.positions.list(wallet="0xabc...", status="active")
fresh = client.positions.retrieve(pos["id"])   # live accrued yield
events = client.positions.history(pos["id"])

client.positions.withdraw(pos["id"], amount=250)  # partial
client.positions.withdraw(pos["id"], all=True)    # close out
```

### Rebalances

```python
rebalances = client.rebalances.list(position_id=pos["id"])
print(rebalances[0]["from_vault"], rebalances[0]["to_vault"], rebalances[0]["apy_after"])
```

### Webhooks

```python
hook = client.webhooks.create(
    url="https://example.com/webhooks/thesauros",
    events=["position.rebalanced", "position.active"],
)
print(hook["secret"])  # whsec_... — used to verify deliveries

hooks = client.webhooks.list()
delivery = client.webhooks.test(hook["id"])          # dispatch a synthetic event
log = client.webhooks.events(webhook_id=hook["id"])
client.webhooks.delete(hook["id"])
```

Supported events: `position.opened`, `position.active`, `position.rebalanced`,
`position.withdrawn`, `position.closed`, `yield.threshold`, `system.status`.

### Usage

```python
usage = client.usage.get(range="7d")  # 24h | 7d | 30d
print(usage["totals"]["requests"], usage["totals"]["p99_ms"], len(usage["series"]))
```

### Status

```python
status = client.status.get()
print(status["overall"], [c["status"] for c in status["components"]])
```

## Error handling

All errors extend `ThesaurosError`, so a single `except` can narrow on subclass:

```python
from thesauros import Thesauros, ThesaurosError, ApiError, RateLimitError, NetworkError

try:
    client.positions.retrieve("pos_missing")
except RateLimitError as err:
    print(f"Rate limited; retry after {err.retry_after}s", err.request_id)
except ApiError as err:
    print(f"API error {err.status} {err.code}: {err.message}", err.doc_url)
except NetworkError as err:
    print("Transport failure or timeout", err.cause)
except ThesaurosError as err:
    print("SDK error", err.message)
```

- `ApiError` — a non-2xx response carrying the API error envelope. Attributes:
  `status`, `code`, `message`, `doc_url`, `request_id`.
- `RateLimitError` (subclass of `ApiError`) — a `429`, with `retry_after`
  (seconds). Only raised after automatic retries are exhausted.
- `NetworkError` — DNS/connection/TLS failures or a request timeout. `cause`
  holds the underlying exception when available.
- `ThesaurosError` — base class; also used for client-side validation (e.g. a
  missing `api_key`) and malformed successful responses.

## Rate limiting & retries

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
`X-RateLimit-Reset`, and `X-Request-Id`. The SDK:

- retries `429` and `5xx` responses up to `max_retries` times (default 3),
- uses exponential backoff with jitter,
- honors `Retry-After` (seconds or HTTP-date) and falls back to
  `X-RateLimit-Reset` when choosing the delay,
- enforces a per-request `timeout` (raises `NetworkError`).

Inspect the live state after any call:

```python
client.vaults.list()
print(client.last_response.rate_limit)  # {"limit", "remaining", "reset"}
```

## Verifying webhook signatures

Each delivery includes a `Webhook-Signature` header of the form
`t=<unix>,v1=<hmac_sha256_hex>`, where the HMAC is computed over the string
`"<t>.<rawBody>"` using your endpoint's signing secret (`whsec_...`).

Verify it with the exported helper. Pass the **raw, unmodified** request body:

```python
from thesauros import verify_signature

def webhook_handler(request):
    raw_body = request.body  # the exact bytes received
    ok = verify_signature(
        WEBHOOK_SECRET,
        request.headers.get("Webhook-Signature"),
        raw_body,
        tolerance_seconds=300,  # optional replay protection
    )
    if not ok:
        return HttpResponse("invalid signature", status=400)

    event = json.loads(raw_body)
    # ...handle event...
    return HttpResponse("ok", status=200)
```

The helper recomputes the HMAC-SHA256 and compares against every `v1` component
using `hmac.compare_digest` (constant-time). Multiple `v1` values are supported
for secret rotation.

## Type hints

The package ships inline type information (`py.typed`, PEP 561). Resource
return types are expressed as `TypedDict`s in `thesauros.types`, so type checkers
(mypy, pyright) understand the shape of every response:

```python
from thesauros.types import Vault

vault: Vault = client.vaults.retrieve("vault_abc123")
reveal_type(vault["apy"])  # float
```

At runtime these are ordinary `dict` objects parsed from JSON.

## License

MIT
