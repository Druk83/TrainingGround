#!/usr/bin/env python3
"""Mass-import helper for admin templates."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from dotenv import load_dotenv
from pymongo import MongoClient

SEED_PATH = Path("infra/config/seed/admin_templates.json")


SeedEntry = dict[str, dict[str, Any]]

def load_seed(path: Path) -> list[SeedEntry]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def resolve_mongo_uri() -> str:
    load_dotenv()
    return (
        os.environ.get("MONGODB_URI")
        or os.environ.get("MONGO_URI")
        or "mongodb://localhost:27017/trainingground"
    )


def resolve_database_name() -> str:
    return os.environ.get("MONGODB_DATABASE") or os.environ.get("MONGO_DATABASE") or "trainingground"


def ensure_document(collection, filter_, payload) -> dict[str, Any]:
    now = datetime.utcnow()
    payload.setdefault("updated_at", now)
    payload.setdefault("created_at", now)
    collection.update_one(filter_, {"$set": payload}, upsert=True)
    result = collection.find_one(filter_)
    if result is None:
        raise RuntimeError(f"Failed to ensure document: {filter_}")
    return result


def import_templates(seed_path: Path, dry_run: bool):
    uri = resolve_mongo_uri()
    database_name = resolve_database_name()
    client = MongoClient(uri)
    db = client.get_database(database_name)

    templates = load_seed(seed_path)
    print(f"[+] Loaded {len(templates)} template entry(ies) from {seed_path}")

    for entry in templates:
        topic: dict[str, Any] = entry["topic"]
        level: dict[str, Any] = entry["level"]
        rule: dict[str, Any] = entry["rule"]
        template: dict[str, Any] = entry["template"]

        topic_doc = {
            "slug": topic["slug"],
            "name": topic["name"],
            "description": topic.get("description", ""),
        }
        level_doc = {
            "topic_id": None,
            "order": int(level["order"]),
            "name": level["name"],
            "unlock_condition": level.get("unlock_condition", {}),
        }
        rule_doc = {
            "slug": rule["slug"],
            "name": rule["name"],
            "description": rule["description"],
            "examples": rule.get("examples", []),
            "metadata": rule.get("metadata", {}),
        }
        template_doc = {
            "slug": template["slug"],
            "content": template["content"],
            "params": template.get("params", {}),
            "metadata": template.get("metadata", {}),
            "difficulty": template.get("difficulty"),
            "source_refs": template.get("source_refs", []),
            "status": "draft",
            "version": 1,
            "pii_flags": [],
        }

        topic_record = ensure_document(db["topics"], {"slug": topic_doc["slug"]}, topic_doc)
        level_doc["topic_id"] = topic_record["_id"]
        level_filter = {"topic_id": level_doc["topic_id"], "order": level_doc["order"]}
        level_record = ensure_document(db["levels"], level_filter, level_doc)
        rule_record = ensure_document(db["rules"], {"slug": rule_doc["slug"]}, rule_doc)

        template_doc["level_id"] = level_record["_id"]
        template_doc["rule_ids"] = [rule_record["_id"]]

        if not dry_run:
            db["templates"].update_one(
                {"slug": template_doc["slug"], "level_id": template_doc["level_id"]},
                {"$set": template_doc},
                upsert=True,
            )
            print(f"[+] Imported template `{template_doc['slug']}` for topic `{topic_doc['slug']}`")
        else:
            print(f"[DRY RUN] Would import template `{template_doc['slug']}`")


def main():
    parser = argparse.ArgumentParser(description="Seed admin templates + rules into MongoDB")
    parser.add_argument(
        "--file",
        type=Path,
        default=SEED_PATH,
        help="Path to template seed JSON",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be inserted without writing to the database",
    )
    args = parser.parse_args()

    if not args.file.exists():
        raise SystemExit(f"Seed file not found: {args.file}")

    import_templates(args.file, args.dry_run)


if __name__ == "__main__":
    main()
