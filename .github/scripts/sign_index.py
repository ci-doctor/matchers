"""Sign the deployed index for ci-doctor: write `index.yaml.sig` next to `index.yaml`.

The format is ci-doctor's (`ci_doctor/matchers/signing.py`): a JSON envelope

    {"key_id": "...", "payload": "<base64>", "signature": "<base64>"}

whose payload is the JSON `{"expires", "index_sha256", "version"}` (sorted keys,
no spaces) and whose signature is Ed25519 over the payload's bytes. `version` is
the signing time in seconds, so every deploy and every weekly re-sign is higher
than the last; `expires` is 30 days on. The key is the `INDEX_SIGNING_KEY` secret
(a base64 Ed25519 seed); `INDEX_SIGNING_KEY_ID` names it, as ci-doctor's key list does.

Usage: python sign_index.py DIR   (DIR holds the index.yaml being deployed)
"""

import base64
import hashlib
import json
import os
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from nacl.signing import SigningKey

VALID_FOR = timedelta(days=30)


def envelope(index: bytes, *, key_id: str, private_key: str, now: float) -> bytes:
    """The signature file for `index`, signed at `now` (Unix seconds)."""
    claims = {
        "index_sha256": hashlib.sha256(index).hexdigest(),
        "version": int(now),
        "expires": (datetime.fromtimestamp(now, UTC) + VALID_FOR).isoformat(),
    }
    payload = json.dumps(claims, sort_keys=True, separators=(",", ":")).encode()
    signature = SigningKey(base64.b64decode(private_key)).sign(payload).signature
    doc = {"key_id": key_id, "payload": base64.b64encode(payload).decode(), "signature": base64.b64encode(signature).decode()}
    return json.dumps(doc, indent=2).encode() + b"\n"


def main(root: str) -> int:
    key = os.environ.get("INDEX_SIGNING_KEY", "")
    key_id = os.environ.get("INDEX_SIGNING_KEY_ID", "")
    if not key or not key_id:
        print("::error::INDEX_SIGNING_KEY and INDEX_SIGNING_KEY_ID must be set; the deploy is never published unsigned")
        return 1
    index = Path(root) / "index.yaml"
    (index.parent / "index.yaml.sig").write_bytes(envelope(index.read_bytes(), key_id=key_id, private_key=key, now=time.time()))
    print(f"signed {index} with {key_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
