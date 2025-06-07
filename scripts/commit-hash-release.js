const { execSync } = require('child_process');

module.exports = {
  analyzeCommits: async () => {
    return 'patch'; // This tells semantic-release to create a release
  },
  
  // Generate the version based on the commit hash
  generateNotes: async (pluginConfig, context) => {
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    
    // Override the version with the commit hash
    context.nextRelease.version = commit;
    context.nextRelease.gitTag = commit;
    
    return `Release ${commit}\n\nCommit: ${context.commits[0]?.hash || commit}`;
  }
};
