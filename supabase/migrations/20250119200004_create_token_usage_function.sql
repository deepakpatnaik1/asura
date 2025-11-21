-- Create function to aggregate monthly token usage
-- Part of Sonnet 4.5 Megafeature: Chunk 3

CREATE OR REPLACE FUNCTION get_monthly_token_usage(p_user_id UUID)
RETURNS TABLE (
  total_input BIGINT,
  total_output BIGINT,
  total_cost_usd DECIMAL(10, 6)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(total_input_tokens), 0)::BIGINT as total_input,
    COALESCE(SUM(total_output_tokens), 0)::BIGINT as total_output,
    COALESCE(SUM(cost_usd), 0.00)::DECIMAL(10, 6) as total_cost_usd
  FROM token_usage
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('month', CURRENT_DATE)
    AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON FUNCTION get_monthly_token_usage IS 'Aggregate token usage for current month by user';
