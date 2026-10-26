-- Caselle di scambio: di ognuna si conserva solo lo SHA-256 del token.
CREATE TABLE vaults (
  vault TEXT PRIMARY KEY,
  auth_hash BLOB NOT NULL,
  created INTEGER NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0
);

-- Buste cifrate e opache: il server non conosce né il contenuto né il tipo di record.
CREATE TABLE envelopes (
  vault TEXT NOT NULL,
  oid TEXT NOT NULL,
  seq INTEGER NOT NULL,
  body BLOB NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (vault, oid)
);

-- Per la lettura in ordine di seq.
CREATE INDEX envelopes_vault_seq ON envelopes (vault, seq);
