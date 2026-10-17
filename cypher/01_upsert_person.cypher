// 01_upsert_person: upsert Person nodes by id. Params: $rows = [{id, name, role?, email?}]. Returns ids.
UNWIND $rows AS r
MERGE (p:Person {id: r.id})
// Aura's movie sample requires this key on every Person. Reserve a separate
// namespace for Helium people so the sample and team data can coexist.
ON CREATE SET p.personTmdbId = 'helium:' + r.id
SET p.name = coalesce(r.name, p.name),
    p.role = coalesce(r.role, p.role),
    p.email = coalesce(r.email, p.email)
RETURN p.id AS id
