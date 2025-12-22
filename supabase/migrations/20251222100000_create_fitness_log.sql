-- Fitness log for Alicja
-- Stores health/fitness entries as flexible JSON

CREATE TABLE canvas_planner_fitness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry jsonb NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now(),
  source_message_id uuid REFERENCES superjournal(id) ON DELETE SET NULL
);

-- Index for user queries
CREATE INDEX idx_canvas_planner_fitness_user_id ON canvas_planner_fitness(user_id);
CREATE INDEX idx_canvas_planner_fitness_logged_at ON canvas_planner_fitness(logged_at DESC);

-- RLS
ALTER TABLE canvas_planner_fitness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fitness entries"
  ON canvas_planner_fitness FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fitness entries"
  ON canvas_planner_fitness FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fitness entries"
  ON canvas_planner_fitness FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own fitness entries"
  ON canvas_planner_fitness FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass
CREATE POLICY "Service role full access"
  ON canvas_planner_fitness FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
