use chrono::{DateTime, Utc};
use mongodb::bson::DateTime as BsonDateTime;

pub fn chrono_to_bson(dt: DateTime<Utc>) -> BsonDateTime {
    BsonDateTime::from_millis(dt.timestamp_millis())
}
