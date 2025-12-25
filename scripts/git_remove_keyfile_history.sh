#!/bin/bash
# Remove mongo-keyfile from git history permanently
# WARNING: This rewrites git history and requires force push!

set -euo pipefail

echo "================================================================"
echo "WARNING: This will rewrite git history!"
echo "================================================================"
echo ""
echo "This script will:"
echo "  1. Remove infra/mongo-keyfile from ALL commits"
echo "  2. Rewrite git history permanently"
echo "  3. Require force push to remote"
echo "  4. Require all team members to re-clone repository"
echo ""
echo "BEFORE RUNNING:"
echo "  - Backup your repository: cp -r . ../MishaGame.backup"
echo "  - Notify all team members"
echo "  - Prepare to rotate MongoDB keyfile immediately after push"
echo ""
read -p "Continue? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "[STEP 1/5] Creating repository backup..."
BACKUP_DIR="../MishaGame.backup.$(date +%Y%m%d_%H%M%S)"
cp -r . "$BACKUP_DIR"
echo "[OK] Backup created at $BACKUP_DIR"

echo ""
echo "[STEP 2/5] Removing file from git history..."
# Remove file from all commits
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch infra/mongo-keyfile' \
  --prune-empty --tag-name-filter cat -- --all

echo ""
echo "[STEP 3/5] Cleaning up git references..."
# Clean up refs
rm -rf .git/refs/original/
git reflog expire --expire=now --all

echo ""
echo "[STEP 4/5] Running git garbage collection..."
git gc --prune=now --aggressive

echo ""
echo "[STEP 5/5] Verifying removal..."
# Verify file is gone from history
if git log --all --full-history -- infra/mongo-keyfile | grep -q "commit"; then
    echo "[ERROR] File still found in git history!"
    echo "Restoration: cp -r $BACKUP_DIR .git"
    exit 1
fi

echo "[OK] mongo-keyfile successfully removed from git history"
echo ""
echo "================================================================"
echo "NEXT STEPS (CRITICAL):"
echo "================================================================"
echo ""
echo "1. Verify changes:"
echo "   git log --all --oneline --graph"
echo "   git log --all --full-history -- infra/mongo-keyfile"
echo ""
echo "2. Force push to remote:"
echo "   git push origin --force --all"
echo "   git push origin --force --tags"
echo ""
echo "3. Notify team to re-clone:"
echo "   cd .."
echo "   rm -rf MishaGame"
echo "   git clone <repository-url>"
echo ""
echo "4. IMMEDIATELY rotate MongoDB keyfile:"
echo "   ./scripts/rotate_mongo_keyfile.sh"
echo ""
echo "5. Consider the old keyfile compromised"
echo ""
echo "Backup location: $BACKUP_DIR"
echo "================================================================"
