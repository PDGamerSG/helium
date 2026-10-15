from hiveboard.embed import DIM, fake_embedding


def test_fake_embedding_is_deterministic_and_unit_norm():
    first = fake_embedding("Helium remembers the decision")
    second = fake_embedding("Helium remembers the decision")
    assert len(first) == DIM
    assert first == second
    assert abs(sum(value * value for value in first) - 1.0) < 1e-6
    assert fake_embedding("different evidence") != first
