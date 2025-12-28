use crate::models::user::{
    BlockUserRequest, CreateUserRequest, ListUsersQuery, UpdateUserRequest, User,
    UserDetailResponse,
};
use anyhow::{anyhow, Context, Result};
use bcrypt::{hash, DEFAULT_COST};
use chrono::{Duration, Utc};
use mongodb::bson::{doc, oid::ObjectId, Regex};
use mongodb::Database;
use redis::aio::ConnectionManager;

pub struct UserManagementService {
    mongo: Database,
    redis: ConnectionManager,
}

impl UserManagementService {
    pub fn new(mongo: Database, redis: ConnectionManager) -> Self {
        Self { mongo, redis }
    }

    /// Создать пользователя (Admin)
    pub async fn create_user(&self, req: CreateUserRequest) -> Result<UserDetailResponse> {
        let users_collection = self.mongo.collection::<User>("users");

        // Проверка уникальности email
        let existing_user = users_collection
            .find_one(doc! { "email": &req.email })
            .await
            .context("Failed to check existing user")?;

        if existing_user.is_some() {
            return Err(anyhow!("User with this email already exists"));
        }

        // Хеширование пароля
        let password_hash = hash(&req.password, DEFAULT_COST).context("Failed to hash password")?;

        // Создание пользователя
        let now = Utc::now();
        let user = User {
            id: None,
            email: req.email.clone(),
            password_hash,
            name: req.name,
            role: req.role,
            group_ids: req.group_ids.unwrap_or_default(),
            is_blocked: false,
            created_at: now,
            updated_at: now,
            last_login_at: None,
            metadata: None,
            blocked_until: None,
            block_reason: None,
        };

        // Вставка в MongoDB
        let insert_result = users_collection
            .insert_one(&user)
            .await
            .context("Failed to insert user")?;

        let user_id = insert_result
            .inserted_id
            .as_object_id()
            .ok_or_else(|| anyhow!("Failed to get inserted user ID"))?;

        // Получение созданного пользователя
        let created_user = users_collection
            .find_one(doc! { "_id": user_id })
            .await
            .context("Failed to fetch created user")?
            .ok_or_else(|| anyhow!("User not found after creation"))?;

        Ok(UserDetailResponse::from(created_user))
    }

    /// Получить список пользователей с фильтрами
    pub async fn list_users(&self, query: ListUsersQuery) -> Result<Vec<UserDetailResponse>> {
        let users_collection = self.mongo.collection::<User>("users");

        // Построение фильтра
        let mut filter = doc! {};

        if let Some(role) = query.role {
            filter.insert("role", role);
        }

        if let Some(group_id) = query.group_id {
            filter.insert("group_ids", group_id);
        }

        if let Some(is_blocked) = query.is_blocked {
            filter.insert("is_blocked", is_blocked);
        }

        if let Some(search) = query.search {
            // Поиск по email или name (case-insensitive)
            let regex = Regex {
                pattern: search,
                options: "i".to_string(),
            };
            filter.insert(
                "$or",
                vec![doc! { "email": &regex }, doc! { "name": &regex }],
            );
        }

        // Пагинация
        let limit = query.limit.unwrap_or(50).min(100) as i64;
        let offset = query.offset.unwrap_or(0) as u64;

        // Запрос к MongoDB
        let mut cursor = users_collection
            .find(filter)
            .skip(offset)
            .limit(limit)
            .await
            .context("Failed to query users")?;

        let mut users = Vec::new();
        while cursor.advance().await.context("Failed to advance cursor")? {
            let user = cursor
                .deserialize_current()
                .context("Failed to deserialize user")?;
            users.push(UserDetailResponse::from(user));
        }

        Ok(users)
    }

    /// Получить пользователя по ID
    pub async fn get_user(&self, user_id: &str) -> Result<UserDetailResponse> {
        let users_collection = self.mongo.collection::<User>("users");

        let object_id = ObjectId::parse_str(user_id).context("Invalid user ID format")?;

        let user = users_collection
            .find_one(doc! { "_id": object_id })
            .await
            .context("Failed to query user")?
            .ok_or_else(|| anyhow!("User not found"))?;

        Ok(UserDetailResponse::from(user))
    }

    /// Обновить пользователя
    pub async fn update_user(
        &self,
        user_id: &str,
        req: UpdateUserRequest,
    ) -> Result<UserDetailResponse> {
        let users_collection = self.mongo.collection::<User>("users");

        let object_id = ObjectId::parse_str(user_id).context("Invalid user ID format")?;

        // Построение update document
        let mut update_doc = doc! {
            "$set": {
                "updatedAt": Utc::now().to_rfc3339(),
            }
        };

        if let Some(name) = req.name {
            update_doc.get_document_mut("$set")?.insert("name", name);
        }

        if let Some(role) = req.role {
            update_doc
                .get_document_mut("$set")?
                .insert("role", role.as_str());
        }

        if let Some(group_ids) = req.group_ids {
            update_doc
                .get_document_mut("$set")?
                .insert("group_ids", group_ids);
        }

        if let Some(is_blocked) = req.is_blocked {
            update_doc
                .get_document_mut("$set")?
                .insert("is_blocked", is_blocked);
        }

        // Обновление в MongoDB
        let result = users_collection
            .update_one(doc! { "_id": object_id }, update_doc)
            .await
            .context("Failed to update user")?;

        if result.matched_count == 0 {
            return Err(anyhow!("User not found"));
        }

        // Получение обновленного пользователя
        let updated_user = users_collection
            .find_one(doc! { "_id": object_id })
            .await
            .context("Failed to fetch updated user")?
            .ok_or_else(|| anyhow!("User not found after update"))?;

        Ok(UserDetailResponse::from(updated_user))
    }

    /// Удалить пользователя
    pub async fn delete_user(&self, user_id: &str) -> Result<()> {
        let users_collection = self.mongo.collection::<User>("users");
        let refresh_tokens_collection = self
            .mongo
            .collection::<mongodb::bson::Document>("refresh_tokens");

        let object_id = ObjectId::parse_str(user_id).context("Invalid user ID format")?;

        // Удаление пользователя
        let result = users_collection
            .delete_one(doc! { "_id": object_id })
            .await
            .context("Failed to delete user")?;

        if result.deleted_count == 0 {
            return Err(anyhow!("User not found"));
        }

        // Удаление всех refresh tokens пользователя
        let user_id_str = object_id.to_hex();
        refresh_tokens_collection
            .delete_many(doc! { "userId": &user_id_str })
            .await
            .context("Failed to delete refresh tokens")?;

        // @todo #A6-01:30min Удалить user_id из groups.student_ids если есть
        //  Требуется после реализации добавления учеников в группу

        Ok(())
    }

    /// Заблокировать пользователя
    pub async fn block_user(
        &self,
        user_id: &str,
        req: BlockUserRequest,
    ) -> Result<UserDetailResponse> {
        let users_collection = self.mongo.collection::<User>("users");
        let refresh_tokens_collection = self
            .mongo
            .collection::<mongodb::bson::Document>("refresh_tokens");

        let object_id = ObjectId::parse_str(user_id).context("Invalid user ID format")?;

        // Вычисление blocked_until
        let blocked_until = req
            .duration_hours
            .map(|duration_hours| Utc::now() + Duration::hours(duration_hours as i64));

        // Обновление пользователя
        let mut update_doc = doc! {
            "$set": {
                "is_blocked": true,
                "blockReason": &req.reason,
                "updatedAt": Utc::now().to_rfc3339(),
            }
        };

        if let Some(until) = blocked_until {
            update_doc
                .get_document_mut("$set")?
                .insert("blockedUntil", until.to_rfc3339());
        } else {
            update_doc
                .get_document_mut("$set")?
                .insert("blockedUntil", mongodb::bson::Bson::Null);
        }

        let result = users_collection
            .update_one(doc! { "_id": object_id }, update_doc)
            .await
            .context("Failed to block user")?;

        if result.matched_count == 0 {
            return Err(anyhow!("User not found"));
        }

        // Отзыв всех refresh tokens (блокировка всех сессий)
        let user_id_str = object_id.to_hex();
        refresh_tokens_collection
            .update_many(
                doc! { "userId": &user_id_str },
                doc! { "$set": { "revoked": true } },
            )
            .await
            .context("Failed to revoke refresh tokens")?;

        // @todo #A6-01:1h Очистить Redis кеш для failed login attempts
        //  Требуется интеграция с Redis для очистки счетчиков

        // Получение обновленного пользователя
        let blocked_user = users_collection
            .find_one(doc! { "_id": object_id })
            .await
            .context("Failed to fetch blocked user")?
            .ok_or_else(|| anyhow!("User not found after blocking"))?;

        Ok(UserDetailResponse::from(blocked_user))
    }

    /// Разблокировать пользователя
    pub async fn unblock_user(&self, user_id: &str) -> Result<UserDetailResponse> {
        let users_collection = self.mongo.collection::<User>("users");

        let object_id = ObjectId::parse_str(user_id).context("Invalid user ID format")?;

        // Обновление пользователя
        let update_doc = doc! {
            "$set": {
                "is_blocked": false,
                "updatedAt": Utc::now().to_rfc3339(),
            },
            "$unset": {
                "blockedUntil": "",
                "blockReason": "",
            }
        };

        let result = users_collection
            .update_one(doc! { "_id": object_id }, update_doc)
            .await
            .context("Failed to unblock user")?;

        if result.matched_count == 0 {
            return Err(anyhow!("User not found"));
        }

        // Получение обновленного пользователя
        let unblocked_user = users_collection
            .find_one(doc! { "_id": object_id })
            .await
            .context("Failed to fetch unblocked user")?
            .ok_or_else(|| anyhow!("User not found after unblocking"))?;

        Ok(UserDetailResponse::from(unblocked_user))
    }
}
