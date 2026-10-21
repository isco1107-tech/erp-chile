const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../..')];
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules'), path.resolve(__dirname, '../../node_modules')];
config.resolver.extraNodeModules = { react: path.join(__dirname, 'node_modules/react'), 'react-native': path.join(__dirname, 'node_modules/react-native') };
module.exports = config;
