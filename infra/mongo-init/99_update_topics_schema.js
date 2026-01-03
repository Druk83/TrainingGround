// Обновление схемы коллекции topics для соответствия Rust модели TopicRecord
// Поле order -> sort_order, добавлены icon_url, status, created_at, updated_at

db = db.getSiblingDB('trainingground');

db.runCommand({
  collMod: 'topics',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['slug', 'name', 'sort_order', 'status', 'created_at', 'updated_at'],
      properties: {
        _id: { bsonType: 'objectId' },
        slug: {
          bsonType: 'string',
          pattern: '^[a-z0-9-]+$',
          description: 'Уникальный slug для URL'
        },
        name: {
          bsonType: 'string',
          description: 'Название темы на русском'
        },
        description: {
          bsonType: 'string',
          description: 'Описание темы'
        },
        icon_url: {
          bsonType: ['string', 'null'],
          description: 'URL иконки темы (опционально)'
        },
        sort_order: {
          bsonType: 'int',
          minimum: 0,
          description: 'Порядок сортировки'
        },
        status: {
          enum: ['active', 'deprecated'],
          description: 'Статус темы'
        },
        created_at: {
          bsonType: 'date',
          description: 'Дата создания'
        },
        updated_at: {
          bsonType: 'date',
          description: 'Дата обновления'
        }
      }
    }
  },
  validationLevel: 'moderate',
  validationAction: 'error'
});

print('Topics collection schema updated successfully');
