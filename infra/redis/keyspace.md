# Redis Keyspace Design for TrainingGround
# All keys with TTL and usage patterns

## Session Management
session:{session_id}                    # Hash, TTL: 60 min
  fields: user_id, level_id, task_id, hints_used, started_at, last_activity

session:timer:{session_id}              # String (ms), TTL: 60 min
  value: timestamp when session started

## Hints
hints_used:{session_id}                 # String (counter), TTL: 60 min
  value: number of hints purchased

hint:cooldown:{user_id}:{task_id}       # String, TTL: 5 sec
  value: "locked" (prevents double-purchase)

## Anticheat
anticheat:{user_id}                     # Hash, TTL: 24 hours
  fields: tab_switches, rapid_submits, last_submit_time, score_pattern

anticheat:block:{user_id}               # String, TTL: variable (15 min - 24 hours)
  value: "blocked" (temporary ban)

## Scoring
score:series:{user_id}                  # List (circular buffer, max 100), TTL: 24 hours
  values: [1, 0, 1, 1, ...] (recent attempt results)

score:streak:{user_id}                  # String (counter), TTL: 24 hours
  value: current correct answer streak

## Feature Flags Cache
feature_flag_cache                      # Hash, TTL: 5 min
  fields: flag_name -> "true|false"

feature_flag:{flag_name}                # String, TTL: 5 min
  value: "true|false|percentage:50"

## Content Changes Stream
content:changes                         # Stream (maxlen ~1000)
  entries: {template_id, action, version, timestamp}

## Explanation Cache
explanation:cache:{task_id}             # String (JSON), TTL: 1 hour
  value: {"text": "...", "generated_at": "..."}

explanation:pending:{task_id}           # String, TTL: 30 sec
  value: "generating" (prevents duplicate requests)

## Analytics Cache
analytics:group:{group_id}              # Hash, TTL: 15 min
  fields: avg_accuracy, total_attempts, active_students

analytics:level:{level_id}              # Hash, TTL: 15 min
  fields: avg_time, completion_rate, difficulty_score

## Rate Limiting
ratelimit:{endpoint}:{user_id}          # String (counter), TTL: 1 min
  value: request count

ratelimit:global:{ip}                   # String (counter), TTL: 1 min
  value: request count from IP

## Leaderboard Cache
leaderboard:{scope}:{scope_id}          # Sorted Set, TTL: 10 min
  members: user_id, score: points

## Task Cache (temporary storage before MongoDB)
task:pending:{session_id}               # String (JSON), TTL: 5 min
  value: generated task waiting for first attempt
