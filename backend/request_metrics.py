"""Background persistence for API request timing metrics."""

from __future__ import annotations

import logging
import os
import queue
import threading
import time
from dataclasses import dataclass

log = logging.getLogger('salesinsight.request_metrics')

QUEUE_MAX = int(os.getenv('REQUEST_METRICS_QUEUE_MAX', '1000'))
BATCH_SIZE = int(os.getenv('REQUEST_METRICS_BATCH_SIZE', '50'))
FLUSH_INTERVAL_SECONDS = float(os.getenv('REQUEST_METRICS_FLUSH_INTERVAL_SECONDS', '1.0'))

_metric_queue: queue.Queue['ApiRequestMetricPayload'] = queue.Queue(maxsize=QUEUE_MAX)
_drop_lock = threading.Lock()
_dropped_metrics = 0


@dataclass(frozen=True)
class ApiRequestMetricPayload:
    method: str
    path: str
    raw_path: str
    status_code: int
    duration_ms: float
    user_id: int | None
    user_email: str | None
    source: str = 'middleware'


def _write_metrics_batch(payloads: list[ApiRequestMetricPayload]) -> None:
    if not payloads:
        return
    from database import SessionLocal
    from models import ApiRequestMetric

    db = SessionLocal()
    try:
        db.add_all([
            ApiRequestMetric(
                method=payload.method,
                path=payload.path,
                raw_path=payload.raw_path,
                status_code=payload.status_code,
                duration_ms=payload.duration_ms,
                user_id=payload.user_id,
                user_email=payload.user_email,
                source=payload.source,
            )
            for payload in payloads
        ])
        db.commit()
    except Exception:
        db.rollback()
        log.debug('request metric batch write failed', exc_info=True)
    finally:
        db.close()


def _metric_worker() -> None:
    while True:
        first = _metric_queue.get()
        batch = [first]
        deadline = time.monotonic() + FLUSH_INTERVAL_SECONDS
        try:
            while len(batch) < BATCH_SIZE:
                timeout = max(0.0, deadline - time.monotonic())
                if timeout == 0:
                    break
                try:
                    batch.append(_metric_queue.get(timeout=timeout))
                except queue.Empty:
                    break
            _write_metrics_batch(batch)
        finally:
            for _ in batch:
                _metric_queue.task_done()


def dropped_metric_count() -> int:
    with _drop_lock:
        return _dropped_metrics


def enqueue_api_request_metric(payload: ApiRequestMetricPayload) -> bool:
    try:
        _metric_queue.put_nowait(payload)
        return True
    except queue.Full:
        global _dropped_metrics
        with _drop_lock:
            _dropped_metrics += 1
        log.debug('request metric queue full; dropping metric')
        return False


_worker = threading.Thread(target=_metric_worker, name='request-metrics', daemon=True)
_worker.start()
