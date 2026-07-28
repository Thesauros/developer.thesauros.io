"""Typed error hierarchy for the Thesauros SDK.

Every error raised by the SDK subclasses :class:`ThesaurosError`, so callers can
catch the whole family with a single ``except ThesaurosError`` and then narrow on
the specific subclass.
"""

from typing import Optional


class ThesaurosError(Exception):
    """Base class for all SDK errors.

    Also raised directly for client-side validation failures (e.g. a missing
    ``api_key``) and malformed successful responses.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class ApiError(ThesaurosError):
    """A non-2xx response carrying the API error envelope.

    Attributes:
        status: HTTP status code.
        code: Machine-readable error code from the envelope.
        message: Human-readable error message.
        doc_url: Optional link to documentation for this error.
        request_id: The ``X-Request-Id`` of the failing request (for support).
    """

    def __init__(
        self,
        message: str,
        status: int,
        code: str,
        doc_url: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.doc_url = doc_url
        self.request_id = request_id


class RateLimitError(ApiError):
    """A ``429 Too Many Requests`` response.

    ``retry_after`` (seconds) is populated from the ``Retry-After`` header or
    derived from ``X-RateLimit-Reset`` when available. The SDK retries these
    automatically up to ``max_retries``; this error is only raised once retries
    are exhausted.
    """

    def __init__(
        self,
        message: str,
        status: int,
        code: str,
        doc_url: Optional[str] = None,
        request_id: Optional[str] = None,
        retry_after: Optional[float] = None,
    ) -> None:
        super().__init__(message, status, code, doc_url, request_id)
        self.retry_after = retry_after


class NetworkError(ThesaurosError):
    """A transport-level failure: DNS, connection refused, TLS, or a timeout.

    The underlying exception (if any) is available on :attr:`cause`.
    """

    def __init__(self, message: str, cause: Optional[BaseException] = None) -> None:
        super().__init__(message)
        self.cause = cause
