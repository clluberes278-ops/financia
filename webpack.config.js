const path = require('node:path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (_env, argv) => ({
  entry: './index.web.js',
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].[contenthash].js', clean: true },
  resolve: {
    alias: {
      'react-native$': 'react-native-web',
      '@react-native-vector-icons/material-design-icons/static$': path.resolve(__dirname, 'apps/mobile/components/MaterialDesignIcons.web.tsx'),
    },
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'],
  },
  module: { rules: [
    {
      test: /\.[jt]sx?$/,
      exclude: /node_modules[\\/](?!react-native|@react-native|@gorhom|@react-navigation)/,
      // The native Babel preset emits CommonJS, including for packages marked type: module.
      // Parse that output as mixed JS so webpack bundles the generated require calls.
      type: 'javascript/auto',
      use: 'babel-loader',
    },
    { test: /\.(ttf|png|jpg|svg)$/, type: 'asset/resource' },
  ] },
  plugins: [
    new webpack.NormalModuleReplacementPlugin(/LinearGradient$/, resource => {
      if (resource.context.includes('react-native-gifted-charts')) resource.request = path.resolve(__dirname, 'apps/mobile/components/GradientView.web.tsx');
    }),
    new webpack.DefinePlugin({ __DEV__: JSON.stringify(argv.mode !== 'production') }),
    new HtmlWebpackPlugin({ template: 'web/index.html' }),
  ],
  devServer: { host: '127.0.0.1', port: 8080, historyApiFallback: true },
});
