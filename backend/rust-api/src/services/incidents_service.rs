use std::collections::HashMap;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use mongodb::bson::{doc, oid::ObjectId, to_bson};
use mongodb::Database;

use crate::models::{
    anticheat::{
        IncidentRecord, IncidentResolutionAction, IncidentStatus, IncidentUserInfo,
        IncidentWithUser, ListIncidentsQuery,
    },
    user::User,
};

pub struct IncidentsService {
    mongo: Database,
}

impl IncidentsService {
    pub fn new(mongo: Database) -> Self {
        Self { mongo }
    }

    pub async fn list_incidents(&self, query: ListIncidentsQuery) -> Result<Vec<IncidentWithUser>> {
        let collection = self.mongo.collection::<IncidentRecord>("incidents");
        let mut filter = doc! {};

        if let Some(incident_type) = query.incident_type {
            filter.insert("incident_type", to_bson(&incident_type)?);
        }

        if let Some(severity) = query.severity {
            filter.insert("severity", to_bson(&severity)?);
        }

        if let Some(status) = query.status {
            filter.insert("status", to_bson(&status)?);
        }

        if let Some(user_id) = query.user_id {
            filter.insert("user_id", user_id);
        }

        let limit = query.limit.unwrap_or(50).min(100) as i64;
        let skip = query.offset.unwrap_or(0) as u64;

        let mut cursor = collection
            .find(filter)
            .sort(doc! { "timestamp": -1 })
            .skip(skip)
            .limit(limit)
            .await
            .context("Failed to query incidents")?;

        let mut incidents = Vec::new();
        while cursor
            .advance()
            .await
            .context("Failed to advance incidents cursor")?
        {
            let incident = cursor
                .deserialize_current()
                .context("Failed to deserialize incident")?;
            incidents.push(incident);
        }

        self.attach_user_info(incidents).await
    }

    pub async fn get_incident(&self, incident_id: &str) -> Result<IncidentWithUser> {
        let collection = self.mongo.collection::<IncidentRecord>("incidents");
        let incident = collection
            .find_one(doc! { "id": incident_id })
            .await
            .context("Failed to fetch incident")?
            .ok_or_else(|| anyhow!("Incident not found"))?;

        let mut results = self.attach_user_info(vec![incident]).await?;
        results
            .pop()
            .ok_or_else(|| anyhow!("Incident enrichment failed"))
    }

    pub async fn update_incident_status(
        &self,
        incident_id: &str,
        action: IncidentResolutionAction,
        note: Option<String>,
        admin_user_id: &str,
    ) -> Result<IncidentWithUser> {
        let collection = self.mongo.collection::<IncidentRecord>("incidents");
        let mut incident = collection
            .find_one(doc! { "id": incident_id })
            .await
            .context("Failed to fetch incident")?
            .ok_or_else(|| anyhow!("Incident not found"))?;

        incident.status = match action {
            IncidentResolutionAction::Resolve => IncidentStatus::Resolved,
            IncidentResolutionAction::FalsePositive => IncidentStatus::FalsePositive,
        };
        incident.resolution_note = note;
        incident.resolved_by = Some(admin_user_id.to_string());
        incident.resolved_at = Some(Utc::now());

        collection
            .replace_one(doc! { "id": &incident.id }, &incident)
            .await
            .context("Failed to update incident status")?;

        self.get_incident(incident_id).await
    }

    async fn attach_user_info(
        &self,
        incidents: Vec<IncidentRecord>,
    ) -> Result<Vec<IncidentWithUser>> {
        let user_ids: Vec<String> = incidents.iter().map(|inc| inc.user_id.clone()).collect();
        let users_map = self.fetch_users_map(&user_ids).await?;

        Ok(incidents
            .into_iter()
            .map(|incident| {
                let user_info = users_map.get(&incident.user_id).cloned();
                IncidentWithUser {
                    incident,
                    user: user_info,
                }
            })
            .collect())
    }

    async fn fetch_users_map(
        &self,
        user_ids: &[String],
    ) -> Result<HashMap<String, IncidentUserInfo>> {
        let collection = self.mongo.collection::<User>("users");
        let object_ids: Vec<ObjectId> = user_ids
            .iter()
            .filter_map(|id| ObjectId::parse_str(id).ok())
            .collect();

        if object_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let mut cursor = collection
            .find(doc! { "_id": { "$in": &object_ids } })
            .await
            .context("Failed to query users for incidents")?;

        let mut map = HashMap::new();
        while cursor
            .advance()
            .await
            .context("Failed to advance users cursor")?
        {
            let user = cursor
                .deserialize_current()
                .context("Failed to deserialize user")?;
            if let Some(id) = user.id {
                map.insert(
                    id.to_hex(),
                    IncidentUserInfo {
                        id: id.to_hex(),
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        is_blocked: user.is_blocked,
                    },
                );
            }
        }

        Ok(map)
    }
}
