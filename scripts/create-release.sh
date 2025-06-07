#!/bin/bash

# Get the short commit hash
COMMIT_HASH=$(git rev-parse --short HEAD)
FULL_COMMIT_HASH=$(git rev-parse HEAD)

echo "Creating release with tag: $COMMIT_HASH"

# Check if tag already exists (using git tag to verify)
if git tag | grep -q "^$COMMIT_HASH$"; then
    echo "Tag $COMMIT_HASH already exists, skipping release creation"
    exit 0
else
    echo "Tag $COMMIT_HASH does not exist, proceeding with release"
fi

# Update changelog
echo "Updating changelog..."
./scripts/update-changelog.sh

# Create the tarball
echo "Creating tarball..."
# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "Error: dist directory not found. Build the plugin first."
    exit 1
fi
mv dist essinghigh-splunk-datasource
echo "Creating tarball: essinghigh-splunk-datasource-$COMMIT_HASH.tar.gz"
tar -czvf "essinghigh-splunk-datasource-$COMMIT_HASH.tar.gz" essinghigh-splunk-datasource
# Verify the tarball was created
if [ ! -f "essinghigh-splunk-datasource-$COMMIT_HASH.tar.gz" ]; then
    echo "Error: Failed to create tarball"
    exit 1
fi

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
    --notes-file release_notes.md \
    --generate-notes

echo "Release $COMMIT_HASH created successfully"

# Commit the updated changelog
if [ -n "$(git status --porcelain CHANGELOG.md)" ]; then
    echo "Committing updated changelog..."
    
    # Configure git (required for GitHub Actions)
    git config --local user.email "action@github.com"
    git config --local user.name "GitHub Action"
    
    # Add and commit
    git add CHANGELOG.md
    git commit -m "Update changelog for release $COMMIT_HASH"
    
    # If running in GitHub Actions, handle authentication for push
    if [ -n "$GITHUB_ACTIONS" ]; then
        # Actions provides a token automatically
        echo "Pushing changes using GitHub Actions token"
        git push origin HEAD:${GITHUB_REF#refs/heads/}
    else
        # For local testing
        echo "Pushing changes"
        git push
    fi
fi
