const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const path = require('node:path');
const workspaceRoot = path.resolve(__dirname, '../..');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const config = {
  projectRoot: __dirname,
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [path.join(workspaceRoot, 'node_modules')],
    blockList: [
      'artifacts', 'backend', 'dist', '.git', '.expo', 'dist-android-check',
      'apps/mobile/android/.gradle', 'apps/mobile/android/.cxx', 'apps/mobile/android/build',
      'apps/mobile/android/app/build', 'apps/mobile/android/app/.cxx', 'apps/mobile/ios/Pods', 'apps/mobile/ios/build',
    ].map(folder => new RegExp(escape(path.resolve(workspaceRoot, folder)) + '[/\\\\].*')),
    resolveRequest(context, moduleName, platform) {
      const result = context.resolveRequest(context, moduleName, platform);
      // Gifted Charts probes optional gradient packages; use our explicit adapter.
      if (result.type === 'sourceFile' && /react-native-gifted-charts[\\/]dist[\\/]Components[\\/]common[\\/]LinearGradient\.js$/.test(result.filePath)) {
        return { type: 'sourceFile', filePath: path.resolve(__dirname, 'components/GradientView.tsx') };
      }
      return result;
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
