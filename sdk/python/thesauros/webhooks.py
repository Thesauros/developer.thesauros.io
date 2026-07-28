"""Webhook signature verification.

The API signs every webhook delivery with an HMAC-SHA256 over the string
``"<t>.<rawBody>"``, where ``<t>`` is the unix timestamp from the signature
header. The header format is::

    Webhook-Signature: t=<unix>,v1=<hex hmac>[,v1=<hex hmac>...]

Verification recomputes the HMAC with your endpoint's signing secret
(``whsec_...``) and compares it against each ``v1`` component using a
constant-time comparison (:func:`hmac.compare_digest`). Multiple ``v1`` values
are supported to allow secret rotation (the sender may sign with the old and new
secret simultaneously).

Built on the standard library (``hmac`` + ``hashlib``); no dependencies.
"""

import hashlib
import hmac
import time
from typing import List, Optional, Tuple, Union


def _parse_signature_header(header: str) -> Tuple[Optional[str], List[str]]:
    """Split a ``Webhook-Signature`` header into its ``t`` and ``v1`` components."""
    t: Optional[str] = None
    v1: List[str] = []
    for part in header.split(","):
        if "=" not in part:
            continue
        key, _, value = part.partition("=")
        key = key.strip()
        value = value.strip()
        if key == "t":
            t = value
        elif key == "v1":
            v1.append(value)
    return t, v1


def verify_signature(
    secret: str,
    signature_header: Optional[str],
    raw_body: Union[str, bytes, bytearray],
    tolerance_seconds: Optional[float] = None,
    now: Optional[float] = None,
) -> bool:
    """Verify a webhook delivery signature.

    Args:
        secret: The endpoint signing secret (``whsec_...``).
        signature_header: The raw ``Webhook-Signature`` header value.
        raw_body: The exact request body bytes as received (``str`` or ``bytes``).
            Must be the unmodified raw body — do not pass a re-serialized/parsed
            object.
        tolerance_seconds: When set, reject signatures whose timestamp ``t`` is
            more than this many seconds from ``now`` (replay protection). Disabled
            by default so verification is purely an authenticity check unless you
            opt in.
        now: Current unix time in seconds. Defaults to :func:`time.time`. Inject
            for tests.

    Returns:
        ``True`` if the signature is authentic, ``False`` otherwise.

    Example::

        from thesauros import verify_signature

        ok = verify_signature(
            webhook["secret"],
            request.headers.get("Webhook-Signature"),
            raw_body,
            tolerance_seconds=300,
        )
    """
    if not signature_header:
        return False

    t, v1_values = _parse_signature_header(signature_header)
    if t is None or not v1_values:
        return False

    if tolerance_seconds is not None:
        try:
            ts = float(t)
        except ValueError:
            return False
        current = now if now is not None else time.time()
        if abs(current - ts) > tolerance_seconds:
            return False

    if isinstance(raw_body, str):
        body_bytes = raw_body.encode("utf-8")
    else:
        body_bytes = bytes(raw_body)

    signed_payload = f"{t}.".encode("utf-8") + body_bytes
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()

    for provided in v1_values:
        # compare_digest is constant-time and accepts str (ASCII) operands.
        if hmac.compare_digest(expected, provided.lower()):
            return True
    return False
