import type { ExpoConfig } from 'expo/config';

const development = process.env.APP_VARIANT === 'development';
const config: ExpoConfig = {
  name: development ? 'Kite Dev' : 'Kite',
  slug: 'kite',
  owner: 'sahban',
  version: '0.1.0',
  scheme: development ? 'kite-dev' : 'kite',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  platforms: ['android'],
  android: {
    package: development ? 'dev.sahban.kite.dev' : 'dev.sahban.kite',
    versionCode: 1,
    adaptiveIcon: {foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#ffffff'},
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.READ_MEDIA_AUDIO', 'android.permission.READ_MEDIA_VIDEO', 'android.permission.READ_MEDIA_IMAGES', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  plugins: ['expo-router', 'expo-status-bar', 'expo-image'],
  experiments: {typedRoutes: true},
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://kite.sahban.dev',
    eas: {projectId: '4fa69886-b775-4371-8e05-d67d23e9169b'},
  },
};
export default config;
