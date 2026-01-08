// MongoDB indexes and TTL configuration
// Runs after 01_init_db.js

print('[INFO] Creating indexes...');

const db = db.getSiblingDB('trainingground');

// === USERS ===
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ sso_provider: 1, sso_id: 1 }, { unique: true, sparse: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ groups: 1 });
print('[OK] Users indexes created');

// === GROUPS ===
db.groups.createIndex({ teacher_id: 1 });
db.groups.createIndex({ student_ids: 1 });
print('[OK] Groups indexes created');

// === TOPICS ===
db.topics.createIndex({ slug: 1 }, { unique: true });
db.topics.createIndex({ order: 1 });
print('[OK] Topics indexes created');

// === LEVELS ===
db.levels.createIndex({ topic_id: 1, order: 1 }, { unique: true });
db.levels.createIndex({ topic_id: 1 });
print('[OK] Levels indexes created');

// === TEMPLATES ===
db.templates.createIndex({ level_id: 1, active: 1 });
db.templates.createIndex({ rule_ids: 1 });
db.templates.createIndex({ version: 1 });
db.templates.createIndex({ createdAt: 1 });
print('[OK] Templates indexes created');

// === TASKS (TTL: 30 days) ===
db.tasks.createIndex({ session_id: 1 });
db.tasks.createIndex({ template_id: 1 });
db.tasks.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days
print('[OK] Tasks indexes created (TTL: 30 days)');

// === ATTEMPTS ===
db.attempts.createIndex({ session_id: 1, timestamp: -1 });
db.attempts.createIndex({ task_id: 1 });
db.attempts.createIndex({ timestamp: -1 });
// Compound index for analytics queries
db.attempts.createIndex({ session_id: 1, task_id: 1, timestamp: -1 });
print('[OK] Attempts indexes created');

// === PROGRESS SUMMARY ===
db.progress_summary.createIndex({ user_id: 1, level_id: 1 }, { unique: true });
db.progress_summary.createIndex({ user_id: 1, updatedAt: -1 });
db.progress_summary.createIndex({ level_id: 1, accuracy: -1 });
print('[OK] Progress summary indexes created');

// === HINTS LOG ===
db.hints_log.createIndex({ session_id: 1, task_id: 1 });
db.hints_log.createIndex({ timestamp: -1 });
print('[OK] Hints log indexes created');

// === RULES ===
db.rules.createIndex({ slug: 1 }, { unique: true });
print('[OK] Rules indexes created');

// === INCIDENTS ===
db.incidents.createIndex({ user_id: 1, timestamp: -1 });
db.incidents.createIndex({ session_id: 1 });
db.incidents.createIndex({ type: 1, severity: 1 });
db.incidents.createIndex({ timestamp: -1 });
// Compound for anticheat queries
db.incidents.createIndex({ user_id: 1, type: 1, timestamp: -1 });
print('[OK] Incidents indexes created');

// === FEATURE FLAGS ===
db.feature_flags.createIndex({ flag_key: 1 }, { unique: true });
db.feature_flags.createIndex({ scope: 1 });
db.feature_flags.createIndex({ enabled: 1 });
db.feature_flags.createIndex({ updated_at: -1 });
db.feature_flags.createIndex({ scope: 1, target_ids: 1 });
print('[OK] Feature flags indexes created');

// === MATERIALIZED STATS ===
db.materialized_stats.createIndex({ type: 1, entity_id: 1 }, { unique: true });
db.materialized_stats.createIndex({ calculatedAt: -1 });
print('[OK] Materialized stats indexes created');

// === TEMPLATE ENRICHMENT RUNS ===
db.template_enrichment_runs.createIndex({ template_id: 1, started_at: -1 });
db.template_enrichment_runs.createIndex({ status: 1, started_at: -1 });
print('[OK] Template enrichment run indexes created');

// === TEMPLATE ENRICHMENT TASKS ===
db.template_enrichment_tasks.createIndex({ template_id: 1, generated_at: -1 });
db.template_enrichment_tasks.createIndex({ run_id: 1 });
db.template_enrichment_tasks.createIndex({ status: 1, generated_at: -1 });
print('[OK] Template enrichment task indexes created');

// === LEADERBOARDS (TTL: 24 hours) ===
db.leaderboards.createIndex({ scope: 1, scope_id: 1 }, { unique: true, sparse: true });
db.leaderboards.createIndex({ generatedAt: 1 }, { expireAfterSeconds: 86400 }); // 24 hours
print('[OK] Leaderboards indexes created (TTL: 24 hours)');

print('[SUCCESS] All indexes created successfully');
