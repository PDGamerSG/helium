import pytest

from hiveboard.db import HiveDB
from hiveboard.temporal import iso_to_ms, ms_to_iso, to_ms
from hiveboard.tenancy import validate_slug


def test_tenant_names_round_trip_and_exclude_snapshots():
    assert HiveDB.graph_name("team_alpha") == "team-team-alpha"
    assert HiveDB.tenant_of("team-team-alpha") == "team_alpha"
    assert HiveDB.tenant_of("team-team-alpha-snap-123") is None
    assert HiveDB.tenant_of("commons") is None


def test_tenant_slug_validation_rejects_unsafe_names():
    assert validate_slug("orbit_2026") == "orbit_2026"
    for value in ("", "Bad Slug", "../../etc", "-starts-wrong", "a" * 59):
        with pytest.raises(ValueError):
            validate_slug(value)


def test_temporal_helpers_round_trip_iso_and_epoch_values():
    moment = iso_to_ms("2026-09-15T10:00:00+05:30")
    assert ms_to_iso(moment) == "2026-09-15T04:30:00.000Z"
    assert to_ms(moment + 1.9) == moment + 1
    assert to_ms("2026-09-15T04:30:00Z") == moment
