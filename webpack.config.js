const path = require('node:path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (_env, argv) => ({
  entry: './index.web.js',
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].[contenthash].js', clean: true },
  resolve: { alias: { 'react-native$': 'react-native-web' }, extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'] },
  module: { rules: [
    { test: /\.[jt]sx?$/, exclude: /node_modules[\\/](?!react-native|@react-native|@gorhom|@react-navigation)/, use: 'babel-loader' },
    { test: /\.(ttf|png|jpg|svg)$/, type: 'asset/resource' },
  ] },
  plugins: [
    new webpack.NormalModuleReplacementPlugin(/LinearGradient$/, resource => {
      if (resource.context.includes('react-native-gifted-charts')) resource.request = path.resolve(__dirname, 'components/GradientView.web.tsx');
    }),
    new webpack.DefinePlugin({ __DEV__: JSON.stringify(argv.mode !== 'production') }),
    new HtmlWebpackPlugin({ template: 'web/index.html' }),
  ],
  devServer: { host: '127.0.0.1', port: 8080, historyApiFallback: true },
});
