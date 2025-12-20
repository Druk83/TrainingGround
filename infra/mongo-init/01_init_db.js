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
        role: { enum: ['student', 'teacher', 'admin'] },
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
      required: ['slug', 'name', 'order'],
      properties: {
        slug: { bsonType: 'string', pattern: '^[a-z0-9-]+$' },
        name: { bsonType: 'string' },
        description: { bsonType: 'string' },
        order: { bsonType: 'int', minimum: 0 }
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

// 11. Incidents collection (anticheat)
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

// 12. Feature flags collection
db.createCollection('feature_flags', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['flag_name', 'enabled', 'updatedAt'],
      properties: {
        flag_name: { bsonType: 'string', pattern: '^[a-z_]+$' },
        enabled: { bsonType: 'bool' },
        rollout_percentage: { bsonType: 'int', minimum: 0, maximum: 100 },
        target_groups: { bsonType: 'array', items: { bsonType: 'string' } },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

// 13. Materialized stats collection
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

// 14. Leaderboards collection (TTL 24 hours)
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
