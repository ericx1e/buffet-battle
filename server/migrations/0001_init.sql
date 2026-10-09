-- Players, runs, ghosts and battles (DESIGN.md, "Database (D1)").

CREATE TABLE players (
  id TEXT PRIMARY KEY,               -- random, 16 bytes base64url
  token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 of the player's secret token; the token itself is never stored
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  version TEXT NOT NULL,             -- game version the run is on
  seed INTEGER NOT NULL,
  day INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  lives INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'won', 'lost', 'abandoned')),
  state TEXT NOT NULL,               -- RunState JSON at the start of the current day
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX runs_player ON runs (player_id, status);

CREATE TABLE ghosts (
  id INTEGER PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  player_id TEXT NOT NULL,
  version TEXT NOT NULL,
  day INTEGER NOT NULL,
  wins INTEGER NOT NULL,             -- record when served
  lives INTEGER NOT NULL,
  plate TEXT NOT NULL,               -- Plate JSON (about 0.5 KB)
  created_at INTEGER NOT NULL
);
CREATE INDEX ghosts_match ON ghosts (version, day, wins, lives, created_at);

CREATE TABLE battles (
  id INTEGER PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  day INTEGER NOT NULL,
  my_ghost_id INTEGER NOT NULL REFERENCES ghosts(id),
  opp_ghost_id INTEGER REFERENCES ghosts(id), -- null when the opponent was a bot
  bot_seed INTEGER,                  -- regenerates the bot plate
  seed INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
  created_at INTEGER NOT NULL
);
CREATE INDEX battles_run ON battles (run_id);
