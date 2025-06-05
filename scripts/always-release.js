module.exports = {
  analyzeCommits: async () => {
    // Always return 'patch' to force a release on every push to main
    return 'patch';
  },
};
