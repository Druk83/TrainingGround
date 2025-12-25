#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import secrets
import string
from pathlib import Path

SEED_PATH = Path("infra/config/seed/admin-superuser.json")


def random_password(length: int = 24):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate superuser seed JSON (keep this file secret)")
    parser.add_argument(
        "--email",
        required=True,
        help="Email address for the seeded superuser",
    )
    parser.add_argument(
        "--name",
        default="Super Admin",
        help="Display name for the superuser",
    )
    parser.add_argument(
        "--groups",
        nargs="*",
        default=["admin"],
        help="Comma-separated list of group IDs to grant",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=SEED_PATH,
        help="Secret seed file path (ignored by git)",
    )

    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)

    # Generate secure random password
    generated_password = random_password()

    payload = {
        "email": args.email,
        "name": args.name,
        "role": "admin",
        "group_ids": args.groups,
        "password": generated_password,
        "metadata": {
            "generated_at": secrets.token_urlsafe(8),
            "note": "Password will be hashed with bcrypt before storage",
        },
    }

    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[OK] Seed file written to {args.output}")
    print("")
    print("SECURITY WARNINGS:")
    print(f"   1. DO NOT commit this file to git (.gitignore should exclude it)")
    print(f"   2. Store this file in a secure vault (Kubernetes Secret, AWS Secrets Manager, etc.)")
    print(f"   3. Save the generated password securely:")
    print("")
    print(f"   Email:    {args.email}")
    print(f"   Password: {generated_password}")
    print("")
    print(f"   Password will be hashed with bcrypt during bootstrap.")


if __name__ == "__main__":
    main()
