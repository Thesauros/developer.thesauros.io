"""Transport layer for the Thesauros SDK.

Responsibilities:
  - attach auth + JSON headers and a stable ``User-Agent``
  - build URLs and query strings against a configurable base URL
  - unwrap the API envelope (return ``data``, surface ``meta`` via ``last_response``)
  - retry ``429`` / ``5xx`` with exponential backoff + jitter, honoring
    ``Retry-After`` and ``X-RateLimit-Reset``
  - enforce a per-request timeout
  - raise typed errors (:class:`ApiError`, :class:`RateLimitError`,
    :class:`NetworkError`)

Built entirely on the Python standard library (``urllib``) so the SDK has zero
runtime dependencies.
"""

import json
import random
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, Optional, Tuple

from .errors import ApiError, NetworkError, RateLimitError, ThesaurosError

#: Default API base URL (the deployed sandbox host). Override via ``base_url``.
DEFAULT_BASE_URL = "https://developer.thesauros.io/api/v1"

_DEFAULT_TIMEOUT = 30.0
_DEFAULT_MAX_RETRIES = 3
_BASE_DELAY = 0.5  # seconds
_MAX_BACKOFF = 10.0  # seconds
_MAX_DELAY = 30.0  # seconds
USER_AGENT = "thesauros-sdk-python/1.0.0"


class LastResponse:
    """Metadata from the most recent completed request.

    Exposed on the client as ``client.last_response`` so that the unwrapped
    ``data`` can be returned directly from resource methods while envelope
    ``meta``, the request id, and rate-limit state remain accessible.

    Attributes:
        status: HTTP status code.
        object: The envelope ``object`` field, if present.
        meta: The envelope ``meta`` dict, if present (e.g. ``{"total": n}``).
        request_id: The ``X-Request-Id`` header value, if present.
        rate_limit: Parsed ``X-RateLimit-*`` headers as
            ``{"limit", "remaining", "reset"}`` (values may be ``None``).
    """

    def __init__(
        self,
        status: int,
        object: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        rate_limit: Optional[Dict[str, Optional[float]]] = None,
    ) -> None:
        self.status = status
        self.object = object
        self.meta = meta
        self.request_id = request_id
        self.rate_limit = rate_limit if rate_limit is not None else {}


def _is_timeout(exc: BaseException) -> bool:
    return isinstance(exc, (socket.timeout, TimeoutError))


class HttpClient:
    """Low-level HTTP client shared by every resource on a :class:`Thesauros`."""

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: float = _DEFAULT_TIMEOUT,
        max_retries: int = _DEFAULT_MAX_RETRIES,
    ) -> None:
        if not api_key:
            raise ThesaurosError("api_key is required to construct a Thesauros client.")
        self.api_key = api_key
        # Guarantee exactly one trailing slash so path joining is stable.
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/") + "/"
        self.timeout = timeout
        self.max_retries = max_retries
        self.last_response: Optional[LastResponse] = None

    # -- public API ---------------------------------------------------------

    def request(
        self,
        method: str,
        path: str,
        query: Optional[Dict[str, Any]] = None,
        body: Optional[Any] = None,
    ) -> Any:
        """Execute a request, unwrap the envelope, and return ``data``.

        Envelope ``meta``, the request id, and rate-limit headers are recorded
        on :attr:`last_response`.
        """
        url = self._build_url(path, query)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        }
        if data is not None:
            headers["Content-Type"] = "application/json"

        attempt = 0
        # Loop performs at most ``max_retries + 1`` total attempts.
        while True:
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            status, resp_headers, raw = self._send(req)

            request_id = resp_headers.get("X-Request-Id")
            rate_limit = self._parse_rate_limit(resp_headers)

            if 200 <= status < 300:
                try:
                    envelope = json.loads(raw) if raw else {}
                except json.JSONDecodeError as exc:
                    raise ThesaurosError("Malformed JSON in successful response.") from exc
                if not isinstance(envelope, dict):
                    envelope = {}
                self.last_response = LastResponse(
                    status=status,
                    object=envelope.get("object"),
                    meta=envelope.get("meta"),
                    request_id=request_id,
                    rate_limit=rate_limit,
                )
                return envelope.get("data")

            # Non-2xx: parse the error envelope (best-effort) and build a typed error.
            err = self._parse_error(raw)
            code = err.get("code") or f"http_{status}"
            message = err.get("message") or "Request failed."
            doc_url = err.get("doc_url")
            retry_after = self._parse_retry_after(resp_headers, rate_limit.get("reset"))

            if status == 429:
                error: ApiError = RateLimitError(
                    message, status, code, doc_url, request_id, retry_after
                )
            else:
                error = ApiError(message, status, code, doc_url, request_id)

            retryable = status == 429 or status >= 500
            if retryable and attempt < self.max_retries:
                time.sleep(self._backoff_delay(attempt, retry_after))
                attempt += 1
                continue
            raise error

    # -- internals ----------------------------------------------------------

    def _send(self, req: "urllib.request.Request") -> Tuple[int, Any, str]:
        """Send a request and normalize the outcome to ``(status, headers, body)``.

        Non-2xx responses are returned (not raised) so the retry logic can handle
        them uniformly. Transport failures raise :class:`NetworkError`.
        """
        try:
            resp = urllib.request.urlopen(req, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            # HTTPError is itself a response-like object for non-2xx statuses.
            body = exc.read().decode("utf-8", errors="replace")
            return exc.code, exc.headers, body
        except urllib.error.URLError as exc:
            if _is_timeout(exc.reason if isinstance(exc.reason, BaseException) else exc):
                raise NetworkError(
                    f"Request timed out after {self.timeout}s", cause=exc
                ) from exc
            raise NetworkError(f"Network request failed: {exc.reason}", cause=exc) from exc
        except (socket.timeout, TimeoutError) as exc:
            raise NetworkError(f"Request timed out after {self.timeout}s", cause=exc) from exc

        with resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, resp.headers, body

    def _build_url(self, path: str, query: Optional[Dict[str, Any]]) -> str:
        url = self.base_url + path.lstrip("/")
        if query:
            params = []
            for key, value in query.items():
                if value is None:
                    continue
                if isinstance(value, bool):
                    rendered = "true" if value else "false"
                else:
                    rendered = str(value)
                params.append((key, rendered))
            if params:
                url += "?" + urllib.parse.urlencode(params)
        return url

    @staticmethod
    def _parse_rate_limit(headers: Any) -> Dict[str, Optional[float]]:
        def num(name: str) -> Optional[float]:
            raw = headers.get(name)
            if raw is None:
                return None
            try:
                return float(raw)
            except (TypeError, ValueError):
                return None

        return {
            "limit": num("X-RateLimit-Limit"),
            "remaining": num("X-RateLimit-Remaining"),
            "reset": num("X-RateLimit-Reset"),
        }

    @staticmethod
    def _parse_retry_after(headers: Any, reset_epoch: Optional[float]) -> Optional[float]:
        """Resolve a retry delay in seconds from response headers, if available."""
        raw = headers.get("Retry-After")
        if raw is not None:
            try:
                return float(raw)
            except (TypeError, ValueError):
                try:
                    when = parsedate_to_datetime(raw)
                except (TypeError, ValueError):
                    when = None
                if when is not None:
                    if when.tzinfo is None:
                        when = when.replace(tzinfo=timezone.utc)
                    delta = (when - datetime.now(timezone.utc)).total_seconds()
                    return max(0.0, delta)
        if reset_epoch is not None:
            return max(0.0, reset_epoch - time.time())
        return None

    @staticmethod
    def _backoff_delay(attempt: int, retry_after: Optional[float]) -> float:
        """Exponential backoff with jitter, floored by any server-provided hint."""
        exponential = min(_MAX_BACKOFF, _BASE_DELAY * (2**attempt))
        jitter = random.random() * _BASE_DELAY
        delay = exponential + jitter
        if retry_after is not None and retry_after > 0:
            delay = max(delay, retry_after)
        return min(delay, _MAX_DELAY)

    @staticmethod
    def _parse_error(raw: str) -> Dict[str, Any]:
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            err = parsed.get("error")
            if isinstance(err, dict):
                return err
        return {}
