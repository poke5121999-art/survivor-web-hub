// Replaces the `sharp` native image library. Only the daily-ingredient Discord
// announcement image uses it, and the edge never announces (no webhook).
module.exports = function sharp() {
  throw new Error('sharp is not available on the edge');
};
