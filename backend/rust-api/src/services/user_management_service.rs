use crate::models::user::{
    BlockUserRequest, BulkUserActionError, BulkUserActionRequest, BulkUserActionResult,
    BulkUserOperation, CreateUserRequest, ListUsersQuery, UpdateUserRequest, User,
    UserDetailResponse,
};
use anyhow::{anyhow, Context, Result};
use bcrypt::{hash, DEFAULT_COST};
use chrono::{Duration, Utc};
use mongodb::bson::{doc, oid::ObjectId, DateTime as BsonDateTime, Regex};
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
                "updatedAt": BsonDateTime::from_millis(Utc::now().timestamp_millis()),
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
                "updatedAt": BsonDateTime::from_millis(Utc::now().timestamp_millis()),
            }
        };

        if let Some(until) = blocked_until {
            update_doc.get_document_mut("$set")?.insert(
                "blockedUntil",
                BsonDateTime::from_millis(until.timestamp_millis()),
            );
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
                "updatedAt": BsonDateTime::from_millis(Utc::now().timestamp_millis()),
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

    pub async fn reset_password(
        &self,
        user_id: &str,
        new_password: &str,
    ) -> Result<UserDetailResponse> {
        let users_collection = self.mongo.collection::<User>("users");
        let object_id = ObjectId::parse_str(user_id).context("Invalid user ID format")?;

        let password_hash =
            hash(new_password, DEFAULT_COST).context("Failed to hash temporary password")?;

        let update_doc = doc! {
            "$set": {
                "password_hash": password_hash,
                "updatedAt": BsonDateTime::from_millis(Utc::now().timestamp_millis()),
            }
        };

        let result = users_collection
            .update_one(doc! { "_id": object_id }, update_doc)
            .await
            .context("Failed to reset password")?;

        if result.matched_count == 0 {
            return Err(anyhow!("User not found"));
        }

        let updated_user = users_collection
            .find_one(doc! { "_id": object_id })
            .await
            .context("Failed to fetch updated user after password reset")?
            .ok_or_else(|| anyhow!("User not found after password reset"))?;

        Ok(UserDetailResponse::from(updated_user))
    }

    pub async fn bulk_user_action(
        &self,
        req: BulkUserActionRequest,
    ) -> Result<BulkUserActionResult> {
        let mut processed = 0usize;
        let mut failed = Vec::new();

        for user_id in req.user_ids {
            let outcome = match &req.operation {
                BulkUserOperation::Block {
                    reason,
                    duration_hours,
                } => {
                    let block_request = BlockUserRequest {
                        reason: reason.clone(),
                        duration_hours: *duration_hours,
                    };
                    self.block_user(&user_id, block_request).await.map(|_| ())
                }
                BulkUserOperation::Unblock => self.unblock_user(&user_id).await.map(|_| ()),
                BulkUserOperation::SetGroups { group_ids } => {
                    self.set_user_groups(&user_id, group_ids.clone()).await
                }
            };

            match outcome {
                Ok(_) => processed += 1,
                Err(err) => failed.push(BulkUserActionError {
                    user_id,
                    error: err.to_string(),
                }),
            }
        }

        Ok(BulkUserActionResult { processed, failed })
    }

    async fn set_user_groups(&self, user_id: &str, group_ids: Vec<String>) -> Result<()> {
        let users_collection = self.mongo.collection::<User>("users");
        let object_id = ObjectId::parse_str(user_id).context("Invalid user ID format")?;

        let update_doc = doc! {
            "$set": {
                "group_ids": group_ids,
                "updatedAt": BsonDateTime::from_millis(Utc::now().timestamp_millis()),
            }
        };

        let result = users_collection
            .update_one(doc! { "_id": object_id }, update_doc)
            .await
            .context("Failed to update user groups")?;

        if result.matched_count == 0 {
            return Err(anyhow!("User not found"));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{config::Config, models::user::UserRole};
    use mongodb::{error::ErrorKind, options::ClientOptions};
    use redis::Client;
    use serial_test::serial;
    use uuid::Uuid;

    async fn create_service() -> UserManagementService {
        let _ = dotenvy::from_filename(".env.test");
        let config = Config::load().expect("test config");
        let mongo_client = connect_mongo(&config).await;
        let db_name = format!("{}_test_{}", config.mongo_database, Uuid::new_v4());
        let db = mongo_client.database(&db_name);
        let redis_client = Client::open(config.redis_uri).expect("redis client");
        let redis_manager = redis_client
            .get_connection_manager()
            .await
            .expect("redis manager");
        UserManagementService::new(db, redis_manager)
    }

    async fn connect_mongo(config: &Config) -> mongodb::Client {
        let mut options = ClientOptions::parse(&config.mongo_uri)
            .await
            .expect("mongo options");
        if let Some(first_host) = options.hosts.first().cloned() {
            options.hosts = vec![first_host];
        }
        options.repl_set_name = None;
        options.direct_connection = Some(true);
        mongodb::Client::with_options(options).expect("mongo client")
    }

    fn should_skip_anyhow(err: &anyhow::Error) -> bool {
        err.downcast_ref::<mongodb::error::Error>()
            .map(should_skip_mongo_error)
            .unwrap_or(false)
    }

    fn should_skip_mongo_error(err: &mongodb::error::Error) -> bool {
        matches!(
            err.kind.as_ref(),
            ErrorKind::Command(command_error)
                if command_error.code == 10107 || command_error.code == 13436
        )
    }

    fn build_request(email: String, name: &str) -> CreateUserRequest {
        CreateUserRequest {
            email,
            password: "Test123!@#".into(),
            name: name.into(),
            role: UserRole::Student,
            group_ids: None,
        }
    }

    fn base_query() -> ListUsersQuery {
        ListUsersQuery {
            role: None,
            group_id: None,
            is_blocked: None,
            search: None,
            limit: None,
            offset: None,
        }
    }

    #[tokio::test]
    #[serial]
    async fn create_user_rejects_duplicate_email() {
        let service = create_service().await;
        let email = format!("dup-{}@test.com", Uuid::new_v4());
        let request = build_request(email.clone(), "Duplicate User");
        if let Err(err) = service.create_user(request.clone()).await {
            if should_skip_anyhow(&err) {
                eprintln!("Skipping create_user_rejects_duplicate_email: {err}");
                return;
            } else {
                panic!("first user created: {err:?}");
            }
        }

        let err = service
            .create_user(request)
            .await
            .expect_err("expected error");
        assert!(
            err.to_string().to_lowercase().contains("already exists"),
            "error should mention duplicate email: {err:?}"
        );

        let list = service.list_users(base_query()).await.expect("list users");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].email, email);
    }

    #[tokio::test]
    #[serial]
    async fn list_users_supports_case_insensitive_search() {
        let service = create_service().await;
        if let Err(err) = service
            .create_user(build_request(
                format!("alice-{}@test.com", Uuid::new_v4()),
                "Alice Example",
            ))
            .await
        {
            if should_skip_anyhow(&err) {
                eprintln!(
                    "Skipping list_users_supports_case_insensitive_search (seed alice): {err}"
                );
                return;
            } else {
                panic!("alice created: {err:?}");
            }
        }
        if let Err(err) = service
            .create_user(build_request(
                format!("bob-{}@test.com", Uuid::new_v4()),
                "Bob Example",
            ))
            .await
        {
            if should_skip_anyhow(&err) {
                eprintln!("Skipping list_users_supports_case_insensitive_search (seed bob): {err}");
                return;
            } else {
                panic!("bob created: {err:?}");
            }
        }

        let mut query = base_query();
        query.search = Some("alice".into());
        let results = service.list_users(query).await.expect("search results");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Alice Example");
    }
}
