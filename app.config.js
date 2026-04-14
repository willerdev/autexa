/**
 * Dynamic Expo config: embeds Supabase env in `extra` so Android always receives
 * credentials even if Metro inlines of EXPO_PUBLIC_* fail (common "Network request failed" cause).
 *
 * `@expo/env` load() does not overwrite variables already present in the shell. A line like
 * `export EXPO_PUBLIC_SUPABASE_URL=` in ~/.zshrc defines the key as an empty string, so values
 * from `.env` never apply and `extra` was empty — fetch then hits an invalid URL.
 * We merge from parsed `.env*` here when the shell value is missing or blank.
 * @see https://docs.expo.dev/guides/environment-variables/
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require('./app.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getEnvFiles } = require('@expo/env');

const projectRoot = __dirname;

/**
 * Merge `.env*` the same way Expo orders them, using `dotenv.parse` only.
 * `parseProjectEnv` + expand merges the shell in and empty exports like
 * `EXPO_PUBLIC_SUPABASE_URL=` in ~/.zshrc wipe file values — that caused empty `extra`.
 */
function mergeEnvFromDisk(root) {
  const merged = {};
  const files = getEnvFiles({ silent: true })
    .map((f) => path.join(root, f))
    .reverse();
  for (const file of files) {
    try {
      Object.assign(merged, dotenv.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      // missing or unreadable file
    }
  }
  return merged;
}

const fileEnv = mergeEnvFromDisk(projectRoot);

function readPublicEnv(name) {
  const shell = process.env[name];
  if (typeof shell === 'string' && shell.trim() !== '') {
    return shell.trim();
  }
  const fromFile = fileEnv[name];
  if (typeof fromFile === 'string' && fromFile.trim() !== '') {
    return fromFile.trim();
  }
  return '';
}

function normalizeAutexaApiUrlBase(raw) {
  let t = String(raw ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (/\/api$/i.test(t)) t = t.replace(/\/api$/i, '').replace(/\/+$/, '');
  return t;
}

const autexaApiUrlForCleartext = normalizeAutexaApiUrlBase(readPublicEnv('EXPO_PUBLIC_AUTEXA_API_URL'));
/** Only allow HTTP (local dev); production HTTPS should not need cleartext. */
const allowAndroidCleartext =
  typeof autexaApiUrlForCleartext === 'string' &&
  autexaApiUrlForCleartext.length > 0 &&
  /^http:\/\//i.test(autexaApiUrlForCleartext);

module.exports = {
  expo: {
    ...appJson.expo,
    owner: 'willer256',
    // Required for `expo prebuild` / `expo run:android` (cannot be auto-injected into app.config.js).
    ios: {
      ...appJson.expo.ios,
      bundleIdentifier: 'com.autexa.app',
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist ?? {}),
        NSCameraUsageDescription: 'Autexa uses the camera so you can show the assistant photos of your vehicle.',
        NSMicrophoneUsageDescription: 'Autexa records short audio so the assistant can help diagnose engine sounds.',
        NSPhotoLibraryUsageDescription: 'Autexa can attach photos from your library when you ask the assistant for help.',
      },
    },
    android: {
      ...appJson.expo.android,
      package: 'com.autexa.app',
      usesCleartextTraffic: allowAndroidCleartext,
    },
    // RN New Architecture + Android has had intermittent fetch/DNS issues; disable for stability.
    newArchEnabled: false,
    scheme: 'autexa',
    plugins: [
      ...(appJson.expo.plugins ?? []),
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash.png',
          resizeMode: 'contain',
          backgroundColor: '#175EA3',
        },
      ],
      [
        '@rnmapbox/maps',
        {
          RNMapboxMapsVersion: '11.20.1',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'Allow Autexa to use your location to show nearby providers on the map.',
        },
      ],
      'expo-web-browser',
      'expo-notifications',
      'expo-font',
      '@react-native-community/datetimepicker',
      'expo-av',
    ],
    extra: {
      ...(appJson.expo.extra ?? {}),
      eas: {
        projectId: 'f0c60803-5b26-4476-8756-b5ddfa107db9',
      },
      supabaseUrl: readPublicEnv('EXPO_PUBLIC_SUPABASE_URL'),
      supabaseAnonKey: readPublicEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
      supportUserId: readPublicEnv('EXPO_PUBLIC_SUPPORT_USER_ID'),
      autexaApiUrl: normalizeAutexaApiUrlBase(readPublicEnv('EXPO_PUBLIC_AUTEXA_API_URL')),
      webAppUrl: readPublicEnv('EXPO_PUBLIC_WEB_APP_URL'),
      mapboxPublicToken: readPublicEnv('EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN'),
    },
  },
};
