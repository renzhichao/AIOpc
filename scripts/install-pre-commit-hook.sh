#!/bin/bash
##############################################################################
# Install Pre-commit Hook Script
#
# This script installs the quality gate pre-commit hook for the repository.
# Run this script once to enable automatic quality checks before commits.
#
# Usage: ./scripts/install-pre-commit-hook.sh
##############################################################################

set -e

HOOKS_DIR=".git/hooks"
SOURCE_HOOK="$HOOKS_DIR/pre-commit.quality-gate"
TARGET_HOOK="$HOOKS_DIR/pre-commit"

echo "Installing pre-commit hook for quality gate..."

# Check if source hook exists
if [[ ! -f "$SOURCE_HOOK" ]]; then
    echo "Error: Source hook file not found: $SOURCE_HOOK"
    echo "Please ensure the quality gate hook file exists."
    exit 1
fi

# Check if target hook already exists
if [[ -f "$TARGET_HOOK" ]]; then
    echo "Warning: A pre-commit hook already exists at $TARGET_HOOK"
    echo ""
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi

    # Backup existing hook
    BACKUP_HOOK="$TARGET_HOOK.backup.$(date +%s)"
    cp "$TARGET_HOOK" "$BACKUP_HOOK"
    echo "Existing hook backed up to: $BACKUP_HOOK"
fi

# Copy the hook
cp "$SOURCE_HOOK" "$TARGET_HOOK"
chmod +x "$TARGET_HOOK"

echo "✓ Pre-commit hook installed successfully!"
echo ""
echo "The quality gate will now run automatically before each commit."
echo ""
echo "To bypass the quality gate (use sparingly):"
echo "  git commit --no-verify"
echo ""
echo "To uninstall:"
echo "  rm .git/hooks/pre-commit"
