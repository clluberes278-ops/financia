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
- `app/`: Root entry point and file-based routing using **Expo Router**.
- `screens/`: (Deprecated) Legacy views. Logic moved to `/app`.
- `components/`: Reusable UI elements.
- `store/`: Global state management using **Zustand** with persistence.
- `utils/`: Financial calculation helpers.
- `types/`: Centralized TypeScript definitions.

### Key Architectural Decisions
- **State Management**: Centralized in Zustand stores.
- **Data Persistence**: Uses `AsyncStorage`.
- **Navigation**: Migrated to **Expo Router** (File-based routing) to follow professional standards.
- **Calculations**: Decoupled logic in `utils/`.
- **Security**: Root-level biometric lock integration.
- **Theming**: Dynamic theming system using Zustand, providing global light/dark mode and customizable accent colors via `utils/theme.ts`.
