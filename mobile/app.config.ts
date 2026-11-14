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
  platforms: ['android', 'web'],
  android: {
    package: development ? 'dev.sahban.kite.dev' : 'dev.sahban.kite',
    versionCode: 1,
    adaptiveIcon: {foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#ffffff'},
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.READ_MEDIA_AUDIO', 'android.permission.READ_MEDIA_VIDEO', 'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  plugins: ['expo-router', 'expo-status-bar', 'expo-image', 'expo-font', ['expo-secure-store',{configureAndroidBackup:true}], ['expo-image-picker',{cameraPermission:false,microphonePermission:false}], ['expo-media-library',{photosPermission:false,savePhotosPermission:'Allow Kite to save images to your photos.',granularPermissions:[],isAccessMediaLocationEnabled:false}]],
  experiments: {typedRoutes: true},
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://kite.sahban.dev',
    eas: {projectId: '4fa69886-b775-4371-8e05-d67d23e9169b'},
  },
};
export default config;
