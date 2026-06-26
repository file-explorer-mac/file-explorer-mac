-- Add B2B/B2C proxy columns to an existing events table.
-- (schema.sql already includes these for fresh databases.)
ALTER TABLE events ADD COLUMN managed TEXT;   -- 'none' | 'mdm' | 'dep'
ALTER TABLE events ADD COLUMN dow INTEGER;     -- local weekday, 0=Sun … 6=Sat
ALTER TABLE events ADD COLUMN hour INTEGER;    -- local hour, 0–23
