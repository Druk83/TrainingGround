-- anticheat_check.lua
-- Check and update anticheat metrics atomically

-- KEYS[1]: anticheat:{user_id}
-- KEYS[2]: anticheat:block:{user_id}
-- ARGV[1]: event_type (tab_switch | rapid_submit)
-- ARGV[2]: timestamp (milliseconds)
-- ARGV[3]: threshold (e.g., 5 for tab switches, 3 for rapid submits)
-- Returns: {is_blocked, event_count, block_duration_seconds}

local block_status = redis.call('GET', KEYS[2])
if block_status then
  return {1, 0, redis.call('TTL', KEYS[2])}
end

local event_type = ARGV[1]
local timestamp = tonumber(ARGV[2])
local threshold = tonumber(ARGV[3])

-- Get current metrics
local metrics = redis.call('HGETALL', KEYS[1])
local metrics_map = {}
for i = 1, #metrics, 2 do
  metrics_map[metrics[i]] = metrics[i + 1]
end

local field_name = event_type
local event_count = tonumber(metrics_map[field_name]) or 0

-- Increment event counter
event_count = event_count + 1
redis.call('HINCRBY', KEYS[1], field_name, 1)
redis.call('HSET', KEYS[1], 'last_' .. event_type .. '_time', timestamp)
redis.call('EXPIRE', KEYS[1], 86400) -- 24 hours

-- Check threshold
if event_count >= threshold then
  local block_duration = 900 -- 15 minutes
  
  if event_type == 'rapid_submit' then
    block_duration = 1800 -- 30 minutes
  elseif event_type == 'pattern_abuse' then
    block_duration = 3600 -- 1 hour
  end
  
  redis.call('SETEX', KEYS[2], block_duration, 'blocked')
  return {1, event_count, block_duration}
end

return {0, event_count, 0}
