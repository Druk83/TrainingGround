// MongoDB initialization script
// Runs on container startup

print('[INFO] Initializing TrainingGround database...');

const db = db.getSiblingDB('trainingground');

// Enable encryption at rest (requires MongoDB Enterprise or Atlas)
// This is a placeholder - actual encryption requires keyfile configuration
print('[INFO] Setting up database configuration...');

// Create collections with validation schemas
print('[INFO] Creating collections...');

// 1. Users collection
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'name', 'role', 'createdAt'],
      properties: {
        email: { bsonType: 'string', pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' },
        name: { bsonType: 'string', minLength: 1, maxLength: 200 },
        role: { enum: ['student', 'teacher', 'content_admin', 'admin'] },
        sso_provider: { enum: ['yandex', 'vk', 'gosuslugi', null] },
        sso_id: { bsonType: ['string', 'null'] },
        groups: { bsonType: 'array', items: { bsonType: 'objectId' } },
        preferences: { bsonType: 'object' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

// 2. Groups collection
db.createCollection('groups', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'teacher_id', 'createdAt'],
      properties: {
        name: { bsonType: 'string', minLength: 1, maxLength: 200 },
        teacher_id: { bsonType: 'objectId' },
        student_ids: { bsonType: 'array', items: { bsonType: 'objectId' } },
        settings: { bsonType: 'object' },
        createdAt: { bsonType: 'date' }
      }
    }
  }
});

// 3. Topics collection
db.createCollection('topics', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['slug', 'name', 'sort_order', 'status', 'created_at', 'updated_at'],
      properties: {
        _id: { bsonType: 'objectId' },
        slug: { bsonType: 'string', pattern: '^[a-z0-9-]+$' },
        name: { bsonType: 'string' },
        description: { bsonType: 'string' },
        icon_url: { bsonType: ['string', 'null'] },
        sort_order: { bsonType: 'int', minimum: 0 },
        status: { enum: ['active', 'deprecated'] },
        created_at: { bsonType: 'date' },
        updated_at: { bsonType: 'date' }
      }
    }
  }
});

// 4. Levels collection
db.createCollection('levels', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['topic_id', 'order', 'name'],
      properties: {
        topic_id: { bsonType: 'objectId' },
        order: { bsonType: 'int', minimum: 0 },
        name: { bsonType: 'string' },
        unlock_condition: { bsonType: 'object' }
      }
    }
  }
});

// 5. Templates collection
db.createCollection('templates', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['level_id', 'rule_ids', 'version', 'createdAt'],
      properties: {
        level_id: { bsonType: 'objectId' },
        rule_ids: { bsonType: 'array', items: { bsonType: 'objectId' } },
        params: { bsonType: 'object' },
        version: { bsonType: 'int', minimum: 1 },
        active: { bsonType: 'bool' },
        createdAt: { bsonType: 'date' }
      }
    }
  }
});

// 6. Tasks collection (TTL 30 days)
db.createCollection('tasks', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['template_id', 'session_id', 'content', 'correct_answer', 'createdAt'],
      properties: {
        template_id: { bsonType: 'objectId' },
        session_id: { bsonType: 'string' },
        content: { bsonType: 'object' },
        correct_answer: { bsonType: 'string' },
        hints: { bsonType: 'array' },
        createdAt: { bsonType: 'date' }
      }
    }
  }
});

// 7. Attempts collection
db.createCollection('attempts', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['session_id', 'task_id', 'user_answer', 'is_correct', 'timestamp'],
      properties: {
        session_id: { bsonType: 'string' },
        task_id: { bsonType: 'objectId' },
        user_answer: { bsonType: 'string' },
        is_correct: { bsonType: 'bool' },
        hints_used: { bsonType: 'int', minimum: 0 },
        time_spent_ms: { bsonType: 'int', minimum: 0 },
        timestamp: { bsonType: 'date' }
      }
    }
  }
});

// 8. Progress summary collection
db.createCollection('progress_summary', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'level_id', 'updatedAt'],
      properties: {
        user_id: { bsonType: 'objectId' },
        level_id: { bsonType: 'objectId' },
        correct_count: { bsonType: 'int', minimum: 0 },
        total_count: { bsonType: 'int', minimum: 0 },
        accuracy: { bsonType: 'double', minimum: 0, maximum: 100 },
        avg_time_ms: { bsonType: 'int', minimum: 0 },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

// 9. Hints log collection
db.createCollection('hints_log', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['session_id', 'task_id', 'hint_index', 'timestamp'],
      properties: {
        session_id: { bsonType: 'string' },
        task_id: { bsonType: 'objectId' },
        hint_index: { bsonType: 'int', minimum: 0 },
        timestamp: { bsonType: 'date' }
      }
    }
  }
});

// 10. Rules collection
db.createCollection('rules', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['slug', 'name', 'description'],
      properties: {
        slug: { bsonType: 'string', pattern: '^[a-z0-9-]+$' },
        name: { bsonType: 'string' },
        description: { bsonType: 'string' },
        examples: { bsonType: 'array' },
        metadata: { bsonType: 'object' }
      }
    }
  }
});

// 11. Word forms collection (Template Generator)
db.createCollection('word_forms', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['word', 'lemma', 'pos'],
      properties: {
        word: { bsonType: 'string', minLength: 1 },
        lemma: { bsonType: 'string', minLength: 1 },
        pos: { enum: ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'numeral'] },
        grammemes: { bsonType: 'object' },
        frequency: { bsonType: 'int', minimum: 0 }
      }
    }
  }
});

// 12. Example sentences collection (Template Generator)
db.createCollection('example_sentences', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['text', 'topic'],
      properties: {
        text: { bsonType: 'string', minLength: 1 },
        topic: { bsonType: 'string' },
        level: { enum: ['beginner', 'intermediate', 'advanced'] },
        tags: { bsonType: 'array', items: { bsonType: 'string' } },
        length: { bsonType: 'int', minimum: 0 }
      }
    }
  }
});

// 13. Incidents collection (anticheat)
db.createCollection('incidents', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'session_id', 'type', 'severity', 'timestamp'],
      properties: {
        user_id: { bsonType: 'objectId' },
        session_id: { bsonType: 'string' },
        type: { enum: ['tab_switch', 'rapid_submit', 'pattern_abuse', 'impossible_time'] },
        severity: { enum: ['low', 'medium', 'high', 'critical'] },
        details: { bsonType: 'object' },
        timestamp: { bsonType: 'date' }
      }
    }
  }
});

// 14. Feature flags collection
db.createCollection('feature_flags', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['flag_key', 'enabled', 'scope', 'version', 'updated_at'],
      properties: {
        flag_key: { bsonType: 'string', pattern: '^[a-z0-9_]+$' },
        description: { bsonType: 'string' },
        enabled: { bsonType: 'bool' },
        scope: { enum: ['global', 'group', 'user'] },
        target_ids: { bsonType: 'array', items: { bsonType: 'string' } },
        config: { bsonType: 'object' },
        version: { bsonType: 'int', minimum: 1 },
        updated_at: { bsonType: 'date' },
        updated_by: { bsonType: 'string' },
        change_reason: { bsonType: 'string' }
      }
    }
  }
});

// 15. Materialized stats collection
db.createCollection('materialized_stats', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['type', 'entity_id', 'metrics', 'calculatedAt'],
      properties: {
        type: { enum: ['group', 'level', 'topic'] },
        entity_id: { bsonType: 'objectId' },
        metrics: { bsonType: 'object' },
        calculatedAt: { bsonType: 'date' }
      }
    }
  }
});

// 16. Leaderboards collection (TTL 24 hours)
db.createCollection('leaderboards', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['scope', 'scope_id', 'rankings', 'generatedAt'],
      properties: {
        scope: { enum: ['global', 'group', 'level'] },
        scope_id: { bsonType: ['objectId', 'null'] },
        rankings: { bsonType: 'array' },
        generatedAt: { bsonType: 'date' }
      }
    }
  }
});

print('[SUCCESS] Collections created');

// Create indexes
print('[INFO] Creating indexes...');

// User indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ 'groups': 1 });
db.users.createIndex({ createdAt: -1 });

// Group indexes
db.groups.createIndex({ teacher_id: 1 });
db.groups.createIndex({ 'student_ids': 1 });

// Topic indexes
db.topics.createIndex({ slug: 1 }, { unique: true });
db.topics.createIndex({ sort_order: 1 });

// Level indexes
db.levels.createIndex({ topic_id: 1, order: 1 });

// Template indexes
db.templates.createIndex({ level_id: 1, active: 1 });
db.templates.createIndex({ 'rule_ids': 1 });
db.templates.createIndex({ version: -1 });
db.templates.createIndex({ createdAt: -1 });

// Task indexes with TTL (30 days)
db.tasks.createIndex({ session_id: 1 });
db.tasks.createIndex({ template_id: 1 });
db.tasks.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

// Attempt indexes
db.attempts.createIndex({ session_id: 1 });
db.attempts.createIndex({ task_id: 1 });
db.attempts.createIndex({ timestamp: -1 });

// Progress summary indexes
db.progress_summary.createIndex({ user_id: 1, level_id: 1 }, { unique: true });
db.progress_summary.createIndex({ level_id: 1, accuracy: -1 });

// Hints log indexes
db.hints_log.createIndex({ session_id: 1 });
db.hints_log.createIndex({ task_id: 1 });

// Rule indexes
db.rules.createIndex({ slug: 1 }, { unique: true });

// Word forms indexes (Template Generator)
db.word_forms.createIndex({ pos: 1 });
db.word_forms.createIndex({ lemma: 1 });
db.word_forms.createIndex({ pos: 1, lemma: 1 });
db.word_forms.createIndex({ frequency: -1 });

// Example sentences indexes (Template Generator)
db.example_sentences.createIndex({ topic: 1 });
db.example_sentences.createIndex({ level: 1 });
db.example_sentences.createIndex({ 'tags': 1 });
db.example_sentences.createIndex({ topic: 1, level: 1 });

// Incident indexes
db.incidents.createIndex({ user_id: 1, timestamp: -1 });
db.incidents.createIndex({ session_id: 1 });
db.incidents.createIndex({ type: 1, severity: 1 });

// Feature flag indexes
db.feature_flags.createIndex({ flag_name: 1 }, { unique: true });

// Materialized stats indexes
db.materialized_stats.createIndex({ type: 1, entity_id: 1 }, { unique: true });
db.materialized_stats.createIndex({ calculatedAt: -1 });

// Leaderboard indexes with TTL (24 hours)
db.leaderboards.createIndex({ scope: 1, scope_id: 1 }, { unique: true });
db.leaderboards.createIndex({ generatedAt: 1 }, { expireAfterSeconds: 86400 });

print('[SUCCESS] Indexes created');
