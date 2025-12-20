-- score_series.lua
-- Update circular score buffer and calculate streak

-- KEYS[1]: score:series:{user_id}
-- KEYS[2]: score:streak:{user_id}
-- ARGV[1]: result (1 = correct, 0 = incorrect)
-- ARGV[2]: max_length (default: 100)
-- Returns: {series_length, current_streak}

local result = tonumber(ARGV[1])
local max_length = tonumber(ARGV[2]) or 100

-- Add result to series (left push)
redis.call('LPUSH', KEYS[1], result)

-- Trim to max length
redis.call('LTRIM', KEYS[1], 0, max_length - 1)

-- Update streak
local current_streak = tonumber(redis.call('GET', KEYS[2])) or 0

if result == 1 then
  -- Correct answer: increment streak
  current_streak = redis.call('INCR', KEYS[2])
else
  -- Incorrect answer: reset streak
  redis.call('SET', KEYS[2], 0)
  current_streak = 0
end

-- Set TTL (24 hours)
redis.call('EXPIRE', KEYS[1], 86400)
redis.call('EXPIRE', KEYS[2], 86400)

-- Get series length
local series_length = redis.call('LLEN', KEYS[1])

return {series_length, current_streak}
