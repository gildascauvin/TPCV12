ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

CREATE POLICY "public_read" ON programs
  FOR SELECT USING (is_public = true);
