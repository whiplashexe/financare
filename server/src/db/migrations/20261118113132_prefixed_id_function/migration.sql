CREATE OR REPLACE FUNCTION prefixed_id(prefix text, n bigint) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT prefix || repeat('0', greatest(3 - length(n::text), 0)) || n::text
$$;
