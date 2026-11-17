const path = require('node:path');
const {getDefaultConfig} = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The UTF-8 mention formatter is shared with the web client. Native dependencies
// always resolve from this app to avoid mixing its React version with the web's.
config.watchFolders = [path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
// Farcaster's bundled factories import Faker. They only need the default locale,
// rather than every locale and prebuilt generator in Faker's root entry point.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@faker-js/faker') {
    return context.resolveRequest(context, '@faker-js/faker/locale/en', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
