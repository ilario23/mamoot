import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import {componentTagger} from 'lovable-tagger';
import type {Plugin} from 'vite';

/**
 * Vite plugin that proxies Strava OAuth token exchange requests
 * so that STRAVA_CLIENT_SECRET never reaches the browser bundle.
 */
function stravaTokenProxy(): Plugin {
  let clientId = '';
  let clientSecret = '';

  return {
    name: 'strava-token-proxy',
    configResolved(config) {
      // loadEnv gives us both VITE_ and non-VITE_ vars
      const env = loadEnv(config.mode, config.root, '');
      clientId = env.VITE_STRAVA_CLIENT_ID ?? '';
      clientSecret = env.STRAVA_CLIENT_SECRET ?? '';
    },
    configureServer(server) {
      server.middlewares.use('/api/strava/token', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        // Parse JSON body
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        let parsed: Record<string, string>;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.end('Invalid JSON');
          return;
        }

        // Build form data for Strava
        const formData = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: parsed.grant_type,
        });

        if (parsed.grant_type === 'authorization_code') {
          formData.set('code', parsed.code);
        } else if (parsed.grant_type === 'refresh_token') {
          formData.set('refresh_token', parsed.refresh_token);
        }

        try {
          const stravaRes = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: formData.toString(),
          });

          const data = await stravaRes.text();
          res.statusCode = stravaRes.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(data);
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({error: 'Failed to contact Strava'}));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({mode}) => ({
  server: {
    host: '::',
    port: 3000,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    stravaTokenProxy(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}));
