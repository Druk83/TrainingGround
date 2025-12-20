-- purchase_hint.lua
-- Atomically purchase a hint with checks

-- KEYS[1]: session:{session_id}
-- KEYS[2]: hints_used:{session_id}
-- KEYS[3]: hint:cooldown:{user_id}:{task_id}
-- ARGV[1]: max_hints (number)
-- ARGV[2]: cooldown_seconds (default: 5)
-- Returns: hint_count | error_code

local session = redis.call('HGETALL', KEYS[1])
if #session == 0 then
  return redis.error_reply('ERR:SESSION_NOT_FOUND')
end

-- Check cooldown
local cooldown = redis.call('GET', KEYS[3])
if cooldown then
  return redis.error_reply('ERR:COOLDOWN_ACTIVE')
end

-- Check current hints usage
local hints_used = tonumber(redis.call('GET', KEYS[2])) or 0
local max_hints = tonumber(ARGV[1])

if hints_used >= max_hints then
  return redis.error_reply('ERR:MAX_HINTS_REACHED')
end

-- Increment hints counter
local new_count = redis.call('INCR', KEYS[2])

-- Set cooldown
redis.call('SETEX', KEYS[3], tonumber(ARGV[2]), 'locked')

-- Update session
redis.call('HSET', KEYS[1], 'hints_used', new_count)
redis.call('EXPIRE', KEYS[1], 3600) -- refresh session TTL
redis.call('EXPIRE', KEYS[2], 3600)

return new_count
