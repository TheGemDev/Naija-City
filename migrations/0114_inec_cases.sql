-- INEC (src/ui/Inec.tsx) lists every decided election case to every player, newest verdict first (worker/efcc.ts
-- inecCases). Without this it would read the whole efcc_cases table, money cases and all, on every page.
CREATE INDEX efcc_election_history ON efcc_cases(kind, resolved_at DESC);
