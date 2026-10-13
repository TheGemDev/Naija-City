-- Calling VDM is free now: you tell him your matter and he decides whether it is worth posting.
-- vdm_at stays "when he exposed it"; this is when the victim last told him about the case.
ALTER TABLE crimes ADD COLUMN vdm_asked_at INTEGER;
