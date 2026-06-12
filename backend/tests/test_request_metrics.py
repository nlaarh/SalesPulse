"""Tests for bounded request metric enqueueing."""


def test_enqueue_api_request_metric_uses_bounded_queue(monkeypatch):
    from request_metrics import ApiRequestMetricPayload, enqueue_api_request_metric
    import request_metrics

    class FullQueue:
        def put_nowait(self, _payload):
            raise request_metrics.queue.Full

    monkeypatch.setattr(request_metrics, '_metric_queue', FullQueue())
    before = request_metrics.dropped_metric_count()

    payload = ApiRequestMetricPayload(
        method='GET',
        path='/api/health',
        raw_path='/api/health',
        status_code=200,
        duration_ms=12.3,
        user_id=None,
        user_email=None,
        source='middleware',
    )

    accepted = enqueue_api_request_metric(payload)

    assert accepted is False
    assert request_metrics.dropped_metric_count() == before + 1
