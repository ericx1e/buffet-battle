-- Google sign-in, more than one device per chef, and endless runs.

-- The Google account a chef is linked to (its stable "sub" id), so the chef can be signed into from any device.
ALTER TABLE players ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX players_google ON players (google_sub) WHERE google_sub IS NOT NULL;

-- Extra device tokens for a chef (each sign-in on a new device gets one); the first device's is players.token_hash.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,       -- SHA-256 of the token
  player_id TEXT NOT NULL REFERENCES players(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_player ON sessions (player_id);

-- A won run that carried on past ten courses (its wins keep counting until the lives run out).
ALTER TABLE runs ADD COLUMN endless INTEGER NOT NULL DEFAULT 0;
CREATE INDEX runs_player_won ON runs (player_id, status, wins);
