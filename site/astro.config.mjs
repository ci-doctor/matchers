import { defineConfig } from 'astro/config';

// matchers.cidoc.dev, served from the root. The registry files (/index.yaml,
// /matchers/, /bundles/) are copied into dist/ by pages.yml; no page may use those paths.
export default defineConfig({
  site: 'https://matchers.cidoc.dev',
  base: '/',
  build: { format: 'directory' },
});
