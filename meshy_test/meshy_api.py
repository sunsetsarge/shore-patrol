"""Shared Meshy API wrapper for the SHORE PATROL asset pipeline.

Consolidates the create / poll / download code that was copy-pasted across
run_p2_batch.py, run_p3_batch.py, run_r4_anims.py, run_r5_boats.py,
run_soldiers_v2.py and friends, each with a slightly different error path
(some sys.exit on 4xx, some raise_for_status, only one retried 429).

Additive: no existing script is modified. New work should import this module.

    from meshy_api import create, poll, download, balance

Self-check (spends zero credits -- balance query only):

    C:/AI-Shared/python.exe meshy_api.py

Key resolution order:
  1. MESHY_API_KEY environment variable (what the old scripts used)
  2. C:/Claude/.credentials/meshy.key
"""

import os
import sys
import time
from typing import Any, Dict

import requests

BASE = "https://api.meshy.ai"
KEY_FILE = r"C:\Claude\.credentials\meshy.key"

# Retry/backoff policy -- ONE definition, previously 3 divergent ones.
MAX_ATTEMPTS = 5
RETRY_BASE_SLEEP = 10          # seconds, doubled per 429
POLL_START_INTERVAL = 5
POLL_MAX_INTERVAL = 30
POLL_TAIL_INTERVAL = 15        # once progress >= 95, Meshy stalls; poll slower
DEFAULT_POLL_TIMEOUT = 900

_SESSION = requests.Session()
_SESSION.trust_env = False     # corporate proxy env vars break Meshy uploads


class MeshyError(RuntimeError):
    """Any non-recoverable Meshy failure: HTTP error, FAILED/CANCELED task, timeout."""


def load_key() -> str:
    """Return the API key, or raise MeshyError. Never prints the key."""
    key = os.environ.get("MESHY_API_KEY", "").strip()
    if key:
        return key
    try:
        with open(KEY_FILE, "r", encoding="utf-8") as fh:
            key = fh.read().strip()
    except OSError as exc:
        raise MeshyError(f"no MESHY_API_KEY and cannot read {KEY_FILE}: {exc}")
    if not key:
        raise MeshyError(f"no MESHY_API_KEY and {KEY_FILE} is empty")
    return key


def _headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {load_key()}"}


def _request(method: str, url: str, **kwargs: Any) -> Dict[str, Any]:
    """Single error-handling path: 429 -> exponential backoff, 4xx/5xx -> MeshyError."""
    sleep = RETRY_BASE_SLEEP
    for attempt in range(1, MAX_ATTEMPTS + 1):
        resp = _SESSION.request(method, url, headers=_headers(), **kwargs)
        if resp.status_code == 429:
            if attempt == MAX_ATTEMPTS:
                raise MeshyError(f"rate limited after {MAX_ATTEMPTS} attempts: {method} {url}")
            time.sleep(sleep)
            sleep = min(sleep * 2, 120)
            continue
        if resp.status_code >= 400:
            raise MeshyError(f"HTTP {resp.status_code} on {method} {url}: {resp.text[:500]}")
        return resp.json()
    raise MeshyError(f"unreachable retry exit: {method} {url}")


def create(endpoint: str, payload: Dict[str, Any]) -> str:
    """POST a task and return its task id.

    endpoint e.g. "/openapi/v1/animations", "/openapi/v2/text-to-3d".
    SPENDS CREDITS for generation endpoints.
    """
    return _request("POST", f"{BASE}{endpoint}", json=payload, timeout=30)["result"]


def poll(task_id: str, endpoint: str, timeout: int = DEFAULT_POLL_TIMEOUT, verbose: bool = True) -> Dict[str, Any]:
    """Block until the task SUCCEEDS; return the full task dict.

    Raises MeshyError on FAILED, CANCELED, or timeout.
    """
    elapsed = 0
    interval = POLL_START_INTERVAL
    while elapsed < timeout:
        task = _request("GET", f"{BASE}{endpoint}/{task_id}", timeout=30)
        status = task.get("status")
        progress = task.get("progress", 0)
        if status == "SUCCEEDED":
            return task
        if status in ("FAILED", "CANCELED"):
            msg = (task.get("task_error") or {}).get("message", "?")
            raise MeshyError(f"TASK_{status} {task_id}: {msg}")
        if verbose:
            print(f"  {task_id} {status} {progress}% ({elapsed}s)", flush=True)
        wait = POLL_TAIL_INTERVAL if progress >= 95 else interval
        time.sleep(wait)
        elapsed += wait
        if progress < 95:
            interval = min(int(interval * 1.5) + 1, POLL_MAX_INTERVAL)
    raise MeshyError(f"TIMEOUT after {timeout}s polling {endpoint}/{task_id}")


def download(url: str, dest: str) -> str:
    """Stream a result asset to dest. Meshy result URLs expire ~3 days after the task."""
    resp = _SESSION.get(url, timeout=300, stream=True)
    if resp.status_code >= 400:
        raise MeshyError(f"HTTP {resp.status_code} downloading {url[:120]}")
    tmp = dest + ".part"
    with open(tmp, "wb") as fh:
        for chunk in resp.iter_content(8192):
            fh.write(chunk)
    os.replace(tmp, dest)
    print(f"DOWNLOADED: {dest} ({os.path.getsize(dest)/1e6:.1f} MB)", flush=True)
    return dest


def balance() -> Dict[str, Any]:
    """Remaining credits. Read-only -- spends nothing."""
    return _request("GET", f"{BASE}/openapi/v1/balance", timeout=15)


if __name__ == "__main__":
    try:
        key = load_key()
        print(f"key: OK ({len(key)} chars, prefix {key[:4]}...)")
        print("balance:", balance())
    except MeshyError as exc:
        sys.exit(f"SELFCHECK FAILED: {exc}")
    print("SELFCHECK OK (zero credits spent)")
