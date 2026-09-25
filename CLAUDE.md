# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start Development Server**: `npm start` (or `npx expo start`)
- **Run on Android**: `npm run android`
- **Run on iOS**: `npm run ios`
- **Run on Web**: `npm run web`
- **Install Dependencies**: `npm install`
- **Build Preview (EAS)**: `eas build --platform android --profile preview` (Android) or `eas build --platform ios --profile preview` (iOS)

## Architecture & Structure

Financia is a personal finance application built with **Expo**, **React Native**, and **TypeScript**. It uses a local-first approach with no backend.

### High-Level Structure
- `App.tsx`: Root component handling navigation (bottom tabs).
- `screens/`: Main page views (Dashboard and Transactions).
- `components/`: Reusable UI elements (e.g., Transaction forms/modals).
- `store/`: Global state management using **Zustand**, including persistence via `@react-native-async-storage/async-storage`.
- `utils/`: Pure helper functions for financial calculations (balance, category totals).
- `types/`: TypeScript definitions for data models (e.g., `Transaction`).

### Key Architectural Decisions
- **State Management**: Centralized in Zustand stores for easy access across screens and automatic persistence to the device.
- **Data Persistence**: Uses `AsyncStorage` for lightweight local storage.
- **Navigation**: Implements `@react-navigation/bottom-tabs` for primary app navigation.
- **Calculations**: Financial logic is decoupled from UI components in `utils/` to ensure testability and consistency.
