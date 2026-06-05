ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS profiles_invite_code_idx ON profiles(invite_code);
