CREATE TABLE workspaces (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  scopes text[] NOT NULL CHECK (scopes <@ ARRAY['read','write','export']),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE flows (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  doc jsonb NOT NULL,
  revision int NOT NULL DEFAULT 1,
  public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX flows_workspace ON flows (workspace_id, updated_at DESC);

CREATE TABLE flow_revisions (
  flow_id text NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  revision int NOT NULL,
  doc jsonb NOT NULL,
  forward jsonb,
  inverse jsonb,
  author_type text NOT NULL CHECK (author_type IN ('user','agent','mcp')),
  client text,
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (flow_id, revision)
);

CREATE TABLE compiled_cache (
  flow_id text NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  revision int NOT NULL,
  compiled jsonb NOT NULL,
  PRIMARY KEY (flow_id, revision)
);

CREATE TABLE jobs (
  id text PRIMARY KEY,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  input jsonb NOT NULL,
  progress real NOT NULL DEFAULT 0,
  result jsonb,
  error text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX jobs_queue ON jobs (created_at) WHERE status = 'queued';
