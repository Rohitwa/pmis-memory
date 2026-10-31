"""push.py — sends reminders to phones as Web Push notifications.

Two standards, both small enough to implement directly:
  RFC 8291  encrypts each message for the receiving browser (aes128gcm)
  RFC 8292  signs each request with this server's VAPID key, so the push
            service (Google's for Chrome on Android) knows who's sending

The VAPID key pair is made once and kept in DATA_DIR/vapid.json.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import struct
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

log = logging.getLogger("divisha.push")
CONTACT = os.environ.get("PUSH_CONTACT", "mailto:admin@divisha-singh.com")


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64u(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _hkdf_extract(salt: bytes, ikm: bytes) -> bytes:
    return hmac.new(salt, ikm, hashlib.sha256).digest()


def _hkdf_expand(prk: bytes, info: bytes, length: int) -> bytes:
    return hmac.new(prk, info + b"\x01", hashlib.sha256).digest()[:length]       # length <= 32


def _public_bytes(key: ec.EllipticCurvePrivateKey) -> bytes:
    return key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def encrypt(plaintext: bytes, ua_public: bytes, auth_secret: bytes, *, as_private: ec.EllipticCurvePrivateKey | None = None,
            salt: bytes | None = None) -> bytes:
    """RFC 8291 message encryption. `as_private` and `salt` are only passed by tests."""
    as_private = as_private or ec.generate_private_key(ec.SECP256R1())
    salt = salt or os.urandom(16)
    as_public = _public_bytes(as_private)
    ua_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    ecdh_secret = as_private.exchange(ec.ECDH(), ua_key)
    prk_key = _hkdf_extract(auth_secret, ecdh_secret)
    ikm = _hkdf_expand(prk_key, b"WebPush: info\x00" + ua_public + as_public, 32)
    prk = _hkdf_extract(salt, ikm)
    cek = _hkdf_expand(prk, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf_expand(prk, b"Content-Encoding: nonce\x00", 12)
    ciphertext = AESGCM(cek).encrypt(nonce, plaintext + b"\x02", None)
    return salt + struct.pack("!IB", 4096, len(as_public)) + as_public + ciphertext


class Pusher:
    def __init__(self, data_dir: str | os.PathLike):
        path = Path(data_dir) / "vapid.json"
        if path.exists():
            pem = json.loads(path.read_text())["private_pem"].encode()
            self.key = serialization.load_pem_private_key(pem, password=None)
        else:
            self.key = ec.generate_private_key(ec.SECP256R1())
            pem = self.key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
            path.write_text(json.dumps({"private_pem": pem.decode()}))
            os.chmod(path, 0o600)
        self.public_key = b64u(_public_bytes(self.key))           # what browsers subscribe with

    def _vapid_header(self, endpoint: str) -> str:
        url = urlparse(endpoint)
        claims = {"aud": f"{url.scheme}://{url.netloc}", "exp": int(time.time()) + 12 * 3600, "sub": CONTACT}
        signing_input = f"{b64u(json.dumps({'typ': 'JWT', 'alg': 'ES256'}).encode())}.{b64u(json.dumps(claims).encode())}"
        r, s = decode_dss_signature(self.key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA256())))
        jwt = f"{signing_input}.{b64u(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"
        return f"vapid t={jwt}, k={self.public_key}"

    def send(self, subscription: dict, message: dict, ttl: int = 3600) -> int:
        """Sends one notification. Returns the push service's HTTP status (410/404: the phone unsubscribed)."""
        body = encrypt(json.dumps(message).encode(), unb64u(subscription["keys"]["p256dh"]), unb64u(subscription["keys"]["auth"]))
        req = urllib.request.Request(subscription["endpoint"], data=body, method="POST", headers={
            "Authorization": self._vapid_header(subscription["endpoint"]),
            "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
            "TTL": str(ttl), "Urgency": "high",
        })
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                return res.status
        except urllib.error.HTTPError as e:
            if e.code not in (404, 410):
                log.warning("Push service answered %s: %s", e.code, e.read()[:200])
            return e.code
        except (urllib.error.URLError, TimeoutError) as e:
            log.warning("Couldn't reach the push service: %s", e)
            return 0
