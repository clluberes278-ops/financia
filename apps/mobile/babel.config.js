module.exports = {
  presets: [require.resolve('@react-native/babel-preset')],
  plugins: [require.resolve('../../scripts/public-config-plugin.cjs'), require.resolve('react-native-worklets/plugin')],
};
