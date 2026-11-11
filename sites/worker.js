// Static-asset Worker for the Vaani Recovery dashboard.
// The SPA is fully client-side (hash routing), so every request is served
// straight from the built assets in ./dist.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
