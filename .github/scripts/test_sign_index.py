import base64
import hashlib
import json

import pytest
from nacl.signing import SigningKey
from sign_index import envelope, main

SEED = base64.b64encode(hashlib.sha256(b"matchers test key").digest()).decode()


def test_the_envelope_verifies_and_names_the_index():
    index = b"schema: 1\nmatchers: {}\n"
    doc = json.loads(envelope(index, key_id="k1", private_key=SEED, now=1_800_000_000))
    payload = base64.b64decode(doc["payload"])
    SigningKey(base64.b64decode(SEED)).verify_key.verify(payload, base64.b64decode(doc["signature"]))
    claims = json.loads(payload)
    assert claims == {
        "expires": "2027-02-14T08:00:00+00:00",
        "index_sha256": hashlib.sha256(index).hexdigest(),
        "version": 1_800_000_000,
    }
    assert payload == json.dumps(claims, sort_keys=True, separators=(",", ":")).encode()
    assert doc["key_id"] == "k1"


def test_a_later_signing_has_a_higher_version():
    first = json.loads(base64.b64decode(json.loads(envelope(b"x", key_id="k", private_key=SEED, now=100))["payload"]))
    later = json.loads(base64.b64decode(json.loads(envelope(b"x", key_id="k", private_key=SEED, now=101))["payload"]))
    assert later["version"] > first["version"]


def test_no_key_means_no_deploy(tmp_path, monkeypatch, capsys):
    (tmp_path / "index.yaml").write_text("schema: 1\n")
    monkeypatch.delenv("INDEX_SIGNING_KEY", raising=False)
    assert main(str(tmp_path)) == 1
    assert "never published unsigned" in capsys.readouterr().out
    assert not (tmp_path / "index.yaml.sig").exists()


def test_main_writes_the_signature_next_to_the_index(tmp_path, monkeypatch):
    (tmp_path / "index.yaml").write_text("schema: 1\n")
    monkeypatch.setenv("INDEX_SIGNING_KEY", SEED)
    monkeypatch.setenv("INDEX_SIGNING_KEY_ID", "k1")
    assert main(str(tmp_path)) == 0
    assert json.loads((tmp_path / "index.yaml.sig").read_text())["key_id"] == "k1"
