use crate::middlewares::auth::JwtService;
use crate::models::refresh_token::{ActiveSession, RefreshToken};
use crate::models::user::{
    AuthResponse, LoginRequest, RegisterRequest, User, UserProfile, UserRole,
};
use anyhow::{anyhow, Context, Result};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Duration, Utc};
use mongodb::bson::{doc, oid::ObjectId};
use mongodb::Database;
use redis::aio::ConnectionManager;
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub struct AuthService {
    mongo: Database,
    redis: ConnectionManager,
    jwt_service: JwtService,
    access_token_ttl_seconds: i64,
    refresh_token_ttl_seconds: i64,
}

impl AuthService {
    pub fn new(mongo: Database, redis: ConnectionManager, jwt_service: JwtService) -> Self {
        // Read TTL from env or use defaults
        let access_token_ttl_seconds = std::env::var("JWT_ACCESS_TOKEN_TTL_SECONDS")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(3600); // Default: 1 hour

        let refresh_token_ttl_seconds = std::env::var("JWT_REFRESH_TOKEN_TTL_SECONDS")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(2592000); // Default: 30 days

        Self {
            mongo,
            redis,
            jwt_service,
            access_token_ttl_seconds,
            refresh_token_ttl_seconds,
        }
    }

    /// Hash a password using bcrypt with cost 12
    pub fn hash_password(&self, password: &str) -> Result<String> {
        hash(password, DEFAULT_COST).context("Failed to hash password")
    }

    /// Verify a password against a hash
    pub fn verify_password(&self, password: &str, hash: &str) -> Result<bool> {
        verify(password, hash).context("Failed to verify password")
    }

    /// Register a new user
    pub async fn register(&self, req: RegisterRequest) -> Result<AuthResponse> {
        let users_collection = self.mongo.collection::<User>("users");

        // Check if user already exists
        let existing_user = users_collection
            .find_one(doc! { "email": &req.email })
            .await
            .context("Failed to check existing user")?;

        if existing_user.is_some() {
            return Err(anyhow!("User with this email already exists"));
        }

        // Hash password
        let password_hash = self.hash_password(&req.password)?;

        // Create user document
        let now = Utc::now();
        let user = User {
            id: None, // MongoDB will generate
            email: req.email.clone(),
            password_hash,
            name: req.name,
            role: req.role.unwrap_or_default(), // Default to student
            group_ids: req.group_ids.unwrap_or_default(),
            is_blocked: false,
            created_at: now,
            updated_at: now,
            last_login_at: None,
            metadata: None,
            blocked_until: None,
            block_reason: None,
        };

        // Insert user
        let insert_result = users_collection
            .insert_one(&user)
            .await
            .context("Failed to insert user")?;

        let user_id = insert_result
            .inserted_id
            .as_object_id()
            .ok_or_else(|| anyhow!("Failed to get inserted user ID"))?;

        // Generate tokens
        let access_token = self.generate_access_token(&user_id, &user.role, &user.group_ids)?;

        // Create refresh token (default remember_me = true for registration)
        let refresh_token = self
            .create_refresh_token(
                &user_id, true, // remember_me = true by default
                None, // no IP tracking on registration
                None, // no user-agent tracking on registration
            )
            .await?;

        // Create user profile
        let mut user_with_id = user;
        user_with_id.id = Some(user_id);
        let user_profile = UserProfile::from(user_with_id);

        Ok(AuthResponse {
            access_token,
            refresh_token,
            user: user_profile,
        })
    }

    /// Login user with email and password
    pub async fn login(
        &self,
        req: LoginRequest,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<AuthResponse> {
        let users_collection = self.mongo.collection::<User>("users");

        // Find user by email
        let user = users_collection
            .find_one(doc! { "email": &req.email })
            .await
            .context("Failed to query user")?
            .ok_or_else(|| anyhow!("Invalid email or password"))?;

        // Check if user is blocked
        if user.is_blocked {
            return Err(anyhow!("User account is blocked"));
        }

        // Verify password
        if !self.verify_password(&req.password, &user.password_hash)? {
            // Log failed login attempt (TODO: implement rate limiting)
            tracing::warn!(
                email = %req.email,
                ip = ?ip,
                "Failed login attempt: invalid password"
            );
            return Err(anyhow!("Invalid email or password"));
        }

        let user_id = user.id.ok_or_else(|| anyhow!("User ID not found"))?;

        // Update last login timestamp
        users_collection
            .update_one(
                doc! { "_id": user_id },
                doc! { "$set": { "lastLoginAt": mongodb::bson::DateTime::now() } },
            )
            .await
            .context("Failed to update last login timestamp")?;

        // Generate access token
        let access_token = self.generate_access_token(&user_id, &user.role, &user.group_ids)?;

        // Create refresh token
        let refresh_token = self
            .create_refresh_token(&user_id, req.remember_me, ip.clone(), user_agent)
            .await?;

        // Log successful login
        tracing::info!(
            user_id = %user_id.to_hex(),
            email = %req.email,
            ip = ?ip,
            "Successful login"
        );

        Ok(AuthResponse {
            access_token,
            refresh_token,
            user: UserProfile::from(user),
        })
    }

    /// Generate JWT access token
    fn generate_access_token(
        &self,
        user_id: &ObjectId,
        role: &UserRole,
        group_ids: &[String],
    ) -> Result<String> {
        let now = Utc::now();
        let exp = now + Duration::seconds(self.access_token_ttl_seconds);

        let claims = crate::middlewares::auth::JwtClaims {
            sub: user_id.to_hex(),
            role: role.as_str().to_string(),
            group_ids: group_ids.to_vec(),
            exp: exp.timestamp() as usize,
            iat: now.timestamp() as usize,
        };

        self.jwt_service
            .generate_token(claims)
            .map_err(|e| anyhow!("Failed to generate token: {}", e))
    }

    /// Create refresh token and store in MongoDB
    async fn create_refresh_token(
        &self,
        user_id: &ObjectId,
        remember_me: bool,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<String> {
        let token = Uuid::new_v4().to_string();
        let token_hash = self.hash_token(&token);

        let now = Utc::now();
        let ttl = if remember_me {
            self.refresh_token_ttl_seconds
        } else {
            86400 // 1 day if not "remember me"
        };
        let expires_at = now + Duration::seconds(ttl);

        let refresh_token = RefreshToken {
            id: None,
            user_id: *user_id,
            token_hash,
            created_at: now,
            expires_at,
            last_used_at: now,
            user_agent,
            ip,
            revoked: false,
        };

        let collection = self.mongo.collection::<RefreshToken>("refresh_tokens");
        collection
            .insert_one(&refresh_token)
            .await
            .context("Failed to insert refresh token")?;

        Ok(token)
    }

    /// Hash a token using SHA-256
    fn hash_token(&self, token: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Refresh access token using refresh token
    pub async fn refresh_token(&self, refresh_token: &str) -> Result<String> {
        let token_hash = self.hash_token(refresh_token);
        let collection = self.mongo.collection::<RefreshToken>("refresh_tokens");

        // Find and validate refresh token
        let token_doc = collection
            .find_one(doc! { "token_hash": &token_hash, "revoked": false })
            .await
            .context("Failed to query refresh token")?
            .ok_or_else(|| anyhow!("Invalid or expired refresh token"))?;

        // Check if expired
        if token_doc.expires_at < Utc::now() {
            return Err(anyhow!("Refresh token has expired"));
        }

        // Update last used timestamp
        collection
            .update_one(
                doc! { "token_hash": &token_hash },
                doc! { "$set": { "lastUsedAt": mongodb::bson::DateTime::now() } },
            )
            .await
            .context("Failed to update refresh token")?;

        // Get user to generate new access token
        let users_collection = self.mongo.collection::<User>("users");
        let user = users_collection
            .find_one(doc! { "_id": token_doc.user_id })
            .await
            .context("Failed to query user")?
            .ok_or_else(|| anyhow!("User not found"))?;

        if user.is_blocked {
            return Err(anyhow!("User account is blocked"));
        }

        // Generate new access token
        let user_id = user.id.ok_or_else(|| anyhow!("User ID not found"))?;
        self.generate_access_token(&user_id, &user.role, &user.group_ids)
    }

    /// Logout user by revoking refresh token
    /// Returns user_id for audit logging
    pub async fn logout(&self, refresh_token: &str) -> Result<String> {
        let token_hash = self.hash_token(refresh_token);
        let collection = self.mongo.collection::<RefreshToken>("refresh_tokens");

        // Find the token to get user_id before revoking
        let token_doc = collection
            .find_one(doc! { "token_hash": &token_hash, "revoked": false })
            .await
            .context("Failed to query refresh token")?
            .ok_or_else(|| anyhow!("Invalid or already revoked refresh token"))?;

        let user_id = token_doc.user_id.to_hex();

        // Revoke the token
        collection
            .update_one(
                doc! { "token_hash": &token_hash },
                doc! { "$set": { "revoked": true } },
            )
            .await
            .context("Failed to revoke refresh token")?;

        Ok(user_id)
    }

    /// Get user by ID
    pub async fn get_user_by_id(&self, user_id: &str) -> Result<User> {
        let object_id = ObjectId::parse_str(user_id).context("Invalid user ID format")?;

        let collection = self.mongo.collection::<User>("users");
        collection
            .find_one(doc! { "_id": object_id })
            .await
            .context("Failed to query user")?
            .ok_or_else(|| anyhow!("User not found"))
    }

    /// Get active sessions for a user
    pub async fn get_active_sessions(
        &self,
        user_id: &str,
        current_token_hash: Option<String>,
    ) -> Result<Vec<ActiveSession>> {
        let object_id = ObjectId::parse_str(user_id).context("Invalid user ID format")?;

        let collection = self.mongo.collection::<RefreshToken>("refresh_tokens");
        let mut cursor = collection
            .find(doc! { "userId": object_id, "revoked": false })
            .await
            .context("Failed to query refresh tokens")?;

        use futures::stream::TryStreamExt;

        let mut sessions = Vec::new();
        while let Some(token) = cursor
            .try_next()
            .await
            .context("Failed to read refresh token")?
        {
            let mut session = ActiveSession::from(token.clone());
            if let Some(ref current_hash) = current_token_hash {
                session.is_current = &token.token_hash == current_hash;
            }
            sessions.push(session);
        }

        Ok(sessions)
    }

    /// Revoke all sessions except current
    pub async fn revoke_other_sessions(&self, user_id: &str, current_token: &str) -> Result<u64> {
        let object_id = ObjectId::parse_str(user_id).context("Invalid user ID format")?;
        let current_token_hash = self.hash_token(current_token);

        let collection = self.mongo.collection::<RefreshToken>("refresh_tokens");
        let result = collection
            .update_many(
                doc! {
                    "userId": object_id,
                    "token_hash": { "$ne": current_token_hash },
                    "revoked": false
                },
                doc! { "$set": { "revoked": true } },
            )
            .await
            .context("Failed to revoke sessions")?;

        Ok(result.modified_count)
    }

    /// Check if account is locked due to failed login attempts
    /// Returns true if locked (>= 5 failed attempts within TTL window)
    pub async fn check_failed_attempts(&self, email: &str) -> Result<bool> {
        let key = format!("failed_login:{}", email);
        let mut conn = self.redis.clone();

        let count: Option<u32> = redis::cmd("GET")
            .arg(&key)
            .query_async(&mut conn)
            .await
            .context("Failed to query failed login attempts")?;

        Ok(count.unwrap_or(0) >= 5)
    }

    /// Increment failed login attempts counter
    /// Returns current count after increment
    /// Sets TTL to 15 minutes (900 seconds) on first failed attempt
    pub async fn increment_failed_attempts(&self, email: &str) -> Result<u32> {
        let key = format!("failed_login:{}", email);
        let mut conn = self.redis.clone();

        // Increment counter
        let count: u32 = redis::cmd("INCR")
            .arg(&key)
            .query_async(&mut conn)
            .await
            .context("Failed to increment failed login attempts")?;

        // Set TTL to 15 minutes if this is the first failed attempt
        if count == 1 {
            redis::cmd("EXPIRE")
                .arg(&key)
                .arg(900) // 15 minutes in seconds
                .query_async::<()>(&mut conn)
                .await
                .context("Failed to set TTL for failed login attempts")?;
        }

        Ok(count)
    }

    /// Clear failed login attempts counter (called on successful login)
    pub async fn clear_failed_attempts(&self, email: &str) -> Result<()> {
        let key = format!("failed_login:{}", email);
        let mut conn = self.redis.clone();

        redis::cmd("DEL")
            .arg(&key)
            .query_async::<()>(&mut conn)
            .await
            .context("Failed to clear failed login attempts")?;

        Ok(())
    }
}
