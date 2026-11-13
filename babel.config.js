module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['./scripts/public-config-plugin.cjs', 'react-native-worklets/plugin'],
};
