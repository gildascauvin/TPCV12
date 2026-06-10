CREATE TABLE programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  sport           TEXT,
  level           TEXT,
  focus           TEXT,
  weeks_count     INT NOT NULL DEFAULT 6,
  sessions_per_week INT NOT NULL DEFAULT 3,
  template        JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON programs FOR ALL USING (owner_id = auth.uid());

CREATE TABLE program_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  coach_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id      UUID,
  user_id         UUID,
  start_date      DATE NOT NULL,
  status          TEXT DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE program_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_or_athlete" ON program_assignments FOR ALL
  USING (coach_id = auth.uid() OR user_id = auth.uid());
