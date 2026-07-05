const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Firebase JS SDK + Metro (Expo SDK 53+): exports apontam para .esm inexistentes.
// https://docs.expo.dev/guides/using-firebase/
if (!config.resolver.sourceExts.includes('cjs')) {
  config.resolver.sourceExts.push('cjs');
}
config.resolver.unstable_enablePackageExports = false;

/** Força entrypoints CJS — evita "Unable to resolve @firebase/util" a partir de auth/dist/rn. */
function firebaseCjs(pkg) {
  return path.join(projectRoot, 'node_modules', pkg, 'dist', 'index.cjs.js');
}

const FIREBASE_CJS = {
  '@firebase/util': firebaseCjs('@firebase/util'),
  '@firebase/component': firebaseCjs('@firebase/component'),
  '@firebase/logger': firebaseCjs('@firebase/logger'),
  '@firebase/app': firebaseCjs('@firebase/app'),
};

const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const cjsPath = FIREBASE_CJS[moduleName];
  if (cjsPath) {
    return { type: 'sourceFile', filePath: cjsPath };
  }
  if (defaultResolve) {
    return defaultResolve(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
