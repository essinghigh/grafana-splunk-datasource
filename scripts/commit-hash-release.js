const { execSync } = require('child_process');

module.exports = {
  // Called by semantic-release to get the tag format
  getTagFormat: async () => {
    // Get short commit hash
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    return commit;
  },
  // Called by semantic-release/github to get the release name
  generateNotes: async (pluginConfig, context) => {
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    return `Release ${commit}`;
  },
};
