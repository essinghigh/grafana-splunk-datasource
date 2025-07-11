#!/bin/bash

# Get the short commit hash and commit message
COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_MESSAGE=$(git log -1 --pretty=%B)
DATE=$(date '+%Y-%m-%d')

# Create changelog entry
CHANGELOG_ENTRY="## $COMMIT_HASH ($DATE)

$COMMIT_MESSAGE

"

# Check if CHANGELOG.md exists
if [ ! -f "CHANGELOG.md" ]; then
    echo "# Changelog" > CHANGELOG.md
    echo "" >> CHANGELOG.md
fi

# Create a temporary file with the new entry at the top
echo "$CHANGELOG_ENTRY" > temp_changelog.md
cat CHANGELOG.md >> temp_changelog.md
mv temp_changelog.md CHANGELOG.md

echo "Updated CHANGELOG.md with entry for $COMMIT_HASH"
