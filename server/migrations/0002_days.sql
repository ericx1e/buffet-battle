-- Each served day as the player played it: the morning's state and the day's actions, so what players buy, sell,
-- refill and keep can be studied (and any day replayed). Linked to the plate it produced.
CREATE TABLE days (
  id INTEGER PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  player_id TEXT NOT NULL,
  version TEXT NOT NULL,
  day INTEGER NOT NULL,
  ghost_id INTEGER REFERENCES ghosts(id),
  morning TEXT NOT NULL,             -- RunState JSON at the start of the day
  actions TEXT NOT NULL,             -- Action[] JSON
  created_at INTEGER NOT NULL
);
CREATE INDEX days_version ON days (version, id);
CREATE INDEX days_created ON days (created_at);
CREATE INDEX ghosts_created ON ghosts (created_at);
CREATE INDEX battles_created ON battles (created_at);
