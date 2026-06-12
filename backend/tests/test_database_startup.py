"""Startup reliability tests for database initialization helpers."""


class _FakeQuery:
    def __init__(self, count_value):
        self._count_value = count_value

    def count(self):
        return self._count_value


class _FakeDb:
    def __init__(self, counts):
        self._counts = list(counts)

    def query(self, _model):
        return _FakeQuery(self._counts.pop(0))


def test_has_seeded_geo_data_requires_zips_and_counties():
    from database import _has_seeded_geo_data

    assert _has_seeded_geo_data(_FakeDb([560, 25])) is True
    assert _has_seeded_geo_data(_FakeDb([560, 0])) is False
    assert _has_seeded_geo_data(_FakeDb([0, 25])) is False
