use crate::models::group::{
    CreateGroupRequest, Group, GroupResponse, ListGroupsQuery, UpdateGroupRequest,
};
use crate::models::user::{User, UserRole};
use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use mongodb::bson::{doc, oid::ObjectId, Regex};
use mongodb::Database;

pub struct GroupService {
    mongo: Database,
}

impl GroupService {
    pub fn new(mongo: Database) -> Self {
        Self { mongo }
    }

    /// Создать группу
    pub async fn create_group(&self, req: CreateGroupRequest) -> Result<GroupResponse> {
        let groups_collection = self.mongo.collection::<Group>("groups");

        // Валидация curator_id (должен существовать и быть teacher)
        let curator_id = if let Some(curator_id_str) = &req.curator_id {
            let curator_oid =
                ObjectId::parse_str(curator_id_str).context("Invalid curator ID format")?;

            // Проверка существования curator
            let users_collection = self.mongo.collection::<User>("users");
            let curator = users_collection
                .find_one(doc! { "_id": curator_oid })
                .await
                .context("Failed to query curator")?
                .ok_or_else(|| anyhow!("Curator not found"))?;

            // Проверка роли
            if curator.role != UserRole::Teacher {
                return Err(anyhow!("Curator must have teacher role"));
            }

            Some(curator_oid)
        } else {
            None
        };

        // Создание группы
        let now = Utc::now();
        let group = Group {
            id: None,
            name: req.name,
            school: req.school,
            curator_id,
            description: req.description,
            created_at: now,
            updated_at: now,
        };

        // Вставка в MongoDB
        let insert_result = groups_collection
            .insert_one(&group)
            .await
            .context("Failed to insert group")?;

        let group_id = insert_result
            .inserted_id
            .as_object_id()
            .ok_or_else(|| anyhow!("Failed to get inserted group ID"))?;

        // Получение созданной группы
        let created_group = groups_collection
            .find_one(doc! { "_id": group_id })
            .await
            .context("Failed to fetch created group")?
            .ok_or_else(|| anyhow!("Group not found after creation"))?;

        // Формирование response с populated данными
        self.populate_group_response(created_group).await
    }

    /// Получить список групп с фильтрами
    pub async fn list_groups(&self, query: ListGroupsQuery) -> Result<Vec<GroupResponse>> {
        let groups_collection = self.mongo.collection::<Group>("groups");

        // Построение фильтра
        let mut filter = doc! {};

        if let Some(school) = query.school {
            filter.insert("school", school);
        }

        if let Some(search) = query.search {
            // Поиск по названию (case-insensitive)
            let regex = Regex {
                pattern: search,
                options: "i".to_string(),
            };
            filter.insert("name", regex);
        }

        // Пагинация
        let limit = query.limit.unwrap_or(50).min(100) as i64;
        let offset = query.offset.unwrap_or(0) as u64;

        // Запрос к MongoDB
        let mut cursor = groups_collection
            .find(filter)
            .skip(offset)
            .limit(limit)
            .await
            .context("Failed to query groups")?;

        let mut groups = Vec::new();
        while cursor.advance().await.context("Failed to advance cursor")? {
            let group = cursor
                .deserialize_current()
                .context("Failed to deserialize group")?;
            let group_response = self.populate_group_response(group).await?;
            groups.push(group_response);
        }

        Ok(groups)
    }

    /// Получить группу по ID
    pub async fn get_group(&self, group_id: &str) -> Result<GroupResponse> {
        let groups_collection = self.mongo.collection::<Group>("groups");

        let object_id = ObjectId::parse_str(group_id).context("Invalid group ID format")?;

        let group = groups_collection
            .find_one(doc! { "_id": object_id })
            .await
            .context("Failed to query group")?
            .ok_or_else(|| anyhow!("Group not found"))?;

        self.populate_group_response(group).await
    }

    /// Обновить группу
    pub async fn update_group(
        &self,
        group_id: &str,
        req: UpdateGroupRequest,
    ) -> Result<GroupResponse> {
        let groups_collection = self.mongo.collection::<Group>("groups");

        let object_id = ObjectId::parse_str(group_id).context("Invalid group ID format")?;

        // Валидация curator_id если указан
        if let Some(ref curator_id_str) = req.curator_id {
            let curator_oid =
                ObjectId::parse_str(curator_id_str).context("Invalid curator ID format")?;

            let users_collection = self.mongo.collection::<User>("users");
            let curator = users_collection
                .find_one(doc! { "_id": curator_oid })
                .await
                .context("Failed to query curator")?
                .ok_or_else(|| anyhow!("Curator not found"))?;

            if curator.role != UserRole::Teacher {
                return Err(anyhow!("Curator must have teacher role"));
            }
        }

        // Построение update document
        let mut update_doc = doc! {
            "$set": {
                "updatedAt": Utc::now().to_rfc3339(),
            }
        };

        if let Some(name) = req.name {
            update_doc.get_document_mut("$set")?.insert("name", name);
        }

        if let Some(school) = req.school {
            update_doc
                .get_document_mut("$set")?
                .insert("school", school);
        }

        if let Some(curator_id) = req.curator_id {
            if let Ok(oid) = ObjectId::parse_str(&curator_id) {
                update_doc
                    .get_document_mut("$set")?
                    .insert("curatorId", oid);
            }
        }

        if let Some(description) = req.description {
            update_doc
                .get_document_mut("$set")?
                .insert("description", description);
        }

        // Обновление в MongoDB
        let result = groups_collection
            .update_one(doc! { "_id": object_id }, update_doc)
            .await
            .context("Failed to update group")?;

        if result.matched_count == 0 {
            return Err(anyhow!("Group not found"));
        }

        // Получение обновленной группы
        let updated_group = groups_collection
            .find_one(doc! { "_id": object_id })
            .await
            .context("Failed to fetch updated group")?
            .ok_or_else(|| anyhow!("Group not found after update"))?;

        self.populate_group_response(updated_group).await
    }

    /// Удалить группу
    pub async fn delete_group(&self, group_id: &str) -> Result<()> {
        let groups_collection = self.mongo.collection::<Group>("groups");
        let users_collection = self.mongo.collection::<User>("users");

        let object_id = ObjectId::parse_str(group_id).context("Invalid group ID format")?;

        // Удаление group_id из всех users.group_ids
        let group_id_str = object_id.to_hex();
        users_collection
            .update_many(
                doc! { "group_ids": &group_id_str },
                doc! { "$pull": { "group_ids": &group_id_str } },
            )
            .await
            .context("Failed to remove group from users")?;

        // Удаление группы
        let result = groups_collection
            .delete_one(doc! { "_id": object_id })
            .await
            .context("Failed to delete group")?;

        if result.deleted_count == 0 {
            return Err(anyhow!("Group not found"));
        }

        Ok(())
    }

    /// Populate GroupResponse с curator_name и student_count
    async fn populate_group_response(&self, group: Group) -> Result<GroupResponse> {
        let mut response = GroupResponse::from(group.clone());

        // Populate curator_name
        if let Some(curator_id) = group.curator_id {
            let users_collection = self.mongo.collection::<User>("users");
            if let Ok(Some(curator)) = users_collection.find_one(doc! { "_id": curator_id }).await {
                response.curator_name = Some(curator.name);
            }
        }

        // Подсчет student_count
        let group_id_str = group.id.map(|id| id.to_hex()).unwrap_or_default();
        let users_collection = self.mongo.collection::<User>("users");
        let student_count = users_collection
            .count_documents(doc! { "group_ids": &group_id_str })
            .await
            .unwrap_or(0);

        response.student_count = student_count as usize;

        Ok(response)
    }
}
