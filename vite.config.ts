import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';
import {loadPublicBuildConfig} from './scripts/public-build-config.mjs';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  // The public Supabase configuration is resolved before anything is built.
  //
  // These two values are inlined into the browser bundle, so they have to be
  // present in the BUILD environment. They used to be read from `.env` alone,
  // which is gitignored: a build in a clean checkout — a CI runner, a fresh
  // worktree, the Cloudflare Pages build — produced a bundle without them, and
  // the application shipped with every sign-in method disabled.
  //
  // They are now resolved from the environment, from `.env` and from the
  // committed `vars` block of `wrangler.jsonc`, in that order, and the build
  // fails when they cannot be found. A build that cannot sign anybody in must
  // not succeed. See `scripts/public-build-config.mjs`.
  const publicConfig = loadPublicBuildConfig(rootDir);
  const { VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY } = publicConfig.values;

  // Vite builds the browser's `import.meta.env` from two places, and both are
  // used here so that the values reach the bundle whichever way Vite reads
  // them:
  //
  //   * `define` — Vite copies every `import.meta.env.*` entry into the
  //     environment object it inlines into the bundle.
  //   * the process environment — Vite's own loader copies every `VITE_`
  //     prefixed variable from the process environment into the same object.
  //
  // The `env` option of the config is NOT used: it is not part of the object
  // Vite inlines, so setting it there would look correct and change nothing.
  for (const [key, value] of Object.entries({
    VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY,
  })) {
    process.env[key] = value;
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(VITE_SUPABASE_PUBLISHABLE_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('node_modules/gsap') || id.includes('node_modules/lenis')) {
                return 'vendor-animation';
              }
              if (id.includes('@supabase/supabase-js')) {
                return 'vendor-supabase';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              return 'vendor-other';
            }
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
