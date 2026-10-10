-- Signing the desktop app in through the browser: Google doesn't allow its sign-in inside an app window, so the app
-- opens buffetbattle.com with a code, the player signs in there, and the app picks up its token by polling.
CREATE TABLE sign_in_links (
  code TEXT PRIMARY KEY,             -- random, in the browser's address
  poll_hash TEXT NOT NULL,           -- SHA-256 of the app's secret for collecting the result
  player_id TEXT,                    -- the chef on the app when it asked (linked to the account if it has none)
  result TEXT,                       -- { playerId, token, name } once signed in, until the app collects it
  created_at INTEGER NOT NULL
);
CREATE INDEX sign_in_links_created ON sign_in_links (created_at);
