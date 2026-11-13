const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const path = require('node:path');
const config = {
  resolver: {
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
