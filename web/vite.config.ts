import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load VITE_* from both `web/` and `web/src/` so `.env` next to source (common mistake) still works.
 * Values in `web/.env` / `web/.env.local` override `web/src/.env`.
 */
export default defineConfig(({ mode }) => {
  const fromSrc = loadEnv(mode, path.join(__dirname, 'src'), 'VITE_');
  const fromRoot = loadEnv(mode, __dirname, 'VITE_');
  const merged = { ...fromSrc, ...fromRoot };

  // Unprefixed keys from .env (server-style copies often set PUBLIC_API_BASE_URL, not VITE_AUTEXA_API_URL)
  const bareSrc = loadEnv(mode, path.join(__dirname, 'src'), '');
  const bareRoot = loadEnv(mode, __dirname, '');
  let apiFallback = String(
    bareRoot.EXPO_PUBLIC_AUTEXA_API_URL ||
      bareSrc.EXPO_PUBLIC_AUTEXA_API_URL ||
      bareRoot.PUBLIC_API_BASE_URL ||
      bareSrc.PUBLIC_API_BASE_URL ||
      '',
  )
    .trim()
    .replace(/\/+$/, '');
  if (/\/api$/i.test(apiFallback)) apiFallback = apiFallback.replace(/\/api$/i, '').replace(/\/+$/, '');

  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }
  if (!(merged.VITE_AUTEXA_API_URL || '').trim() && apiFallback) {
    define['import.meta.env.VITE_AUTEXA_API_URL'] = JSON.stringify(apiFallback);
  }

  return {
    plugins: [react()],
    define,
    server: { port: 5174, host: true },
    preview: { port: 4174 },
  };
});
