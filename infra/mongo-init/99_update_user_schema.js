// Update users collection validation to include content_admin role
db = db.getSiblingDB('trainingground');

db.runCommand({
  collMod: 'users',
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

print('Users collection validation schema updated successfully');
