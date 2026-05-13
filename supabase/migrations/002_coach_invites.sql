-- Coach invite system

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by_coach_id UUID REFERENCES profiles(user_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS coach_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID        NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  token       TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status      TEXT        NOT NULL DEFAULT 'pending', -- pending | accepted
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days'
);

ALTER TABLE coach_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaches insert own invites" ON coach_invites
  FOR INSERT WITH CHECK (coach_id = auth.uid());

CREATE POLICY "coaches update own invites" ON coach_invites
  FOR UPDATE USING (coach_id = auth.uid());

CREATE POLICY "coaches delete own invites" ON coach_invites
  FOR DELETE USING (coach_id = auth.uid());

CREATE POLICY "coaches read own invites" ON coach_invites
  FOR SELECT USING (coach_id = auth.uid());

-- Public read needed for landing page + registration flow (token lookup)
CREATE POLICY "public read by token" ON coach_invites
  FOR SELECT USING (true);
