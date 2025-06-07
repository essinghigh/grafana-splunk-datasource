#!/bin/bash

# Get the short commit hash
COMMIT_HASH=$(git rev-parse --short HEAD)
FULL_COMMIT_HASH=$(git rev-parse HEAD)

echo "Creating release with tag: $COMMIT_HASH"

# Check if tag already exists
if git rev-parse --verify --quiet "$COMMIT_HASH" >/dev/null; then
    echo "Tag $COMMIT_HASH already exists, skipping release creation"
    exit 0
fi

# Update changelog
echo "Updating changelog..."
./scripts/update-changelog.sh

# Create the tarball
echo "Creating tarball..."
mv dist essinghigh-splunk-datasource
tar -czvf "essinghigh-splunk-datasource-$COMMIT_HASH.tar.gz" essinghigh-splunk-datasource

# Get commit message for release notes
COMMIT_MESSAGE=$(git log -1 --pretty=%B)

# Create release notes
cat > release_notes.md << EOF
Release $COMMIT_HASH

Commit: $FULL_COMMIT_HASH

### Changes
$COMMIT_MESSAGE
EOF

echo "Release notes:"
cat release_notes.md

# Create the release using GitHub CLI
gh release create "$COMMIT_HASH" \
    "essinghigh-splunk-datasource-$COMMIT_HASH.tar.gz" \
    --title "Release $COMMIT_HASH" \
    --notes-file release_notes.md

echo "Release $COMMIT_HASH created successfully"

# Commit the updated changelog
if [ -n "$(git status --porcelain CHANGELOG.md)" ]; then
    echo "Committing updated changelog..."
    git config --local user.email "action@github.com"
    git config --local user.name "GitHub Action"
    git add CHANGELOG.md
    git commit -m "Update changelog for release $COMMIT_HASH"
    git push
fi
