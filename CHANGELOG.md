# Changelog

All notable changes to Rudder will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-11-11

### Added
- **Catalyst UI Integration**: Complete UI restructure following Catalyst patterns
- **Dark Mode Support**: Full dark mode compatibility with proper theming
- **Sidebar Navigation**: Responsive sidebar with mobile menu support
- **Release Dashboard**: Clean table view of all Helm releases with status indicators
- **Schema-Generated Forms**: Dynamic form generation from `values.schema.json` files
- **Recursive Form Component**: Handles nested objects and arrays of unlimited depth
- **Catalyst Dialogs**: Modal dialogs using Headless UI components
- **Modern Styling**: Updated to use Tailwind CSS 4 with Catalyst design patterns
- **Icons**: Added Heroicons for better visual feedback
- **Search Interface**: Search bar in header for releases navigation
- **Activity Feed**: Statistics sidebar showing deployment totals
- **Error Handling**: User-friendly error messages with recovery options
- **Loading States**: Improved UX with loading spinners and status updates

### Technical
- **Rust Backend**: Implemented all core Tauri commands for Helm operations
- **Headless UI Components**: Replaced native elements with accessible components
- **Type Safety**: Full TypeScript integration with proper type definitions
- **Tauri 2.0**: Updated to latest Tauri framework
- **Tailwind 4**: Upgraded to latest Tailwind CSS with custom color palette
- **React 19**: Updated to latest React version

### Fixed
- Removed unused imports in App.tsx
- Fixed type declarations for Headless UI components
- Improved responsive design for mobile and desktop views
- Enhanced form validation schema handling

### Files Added
- `CHANGELOG.md` - This changelog file
- `src/ReleaseEditor.tsx` - Modal dialog for editing releases
- `src/SchemaForm.tsx` - Recursive form component
- `src/KubeconfigPaste.tsx` - Kubeconfig input dialog
- `src-tauri/src/lib.rs` - Rust backend implementation
- `src-tauri/Cargo.toml` - Rust dependencies
- `src-tauri/tauri.conf.json` - Tauri configuration

### Files Modified
- `src/App.tsx` - Complete Catalyst UI restructure
- `src/main.tsx` - Updated imports and rendering
- `src/index.css` - Tailwind CSS directives
- `tailwind.config.js` - Custom Tailwind configuration with color palette
- `index.html` - Dark mode support and proper body styling

### Dependencies Added
- `@headlessui/react` ^2.2.9 - Accessible UI components
- `@heroicons/react` ^2.2.0 - Icon set
- `@tauri-apps/plugin-shell` ^2.0.0 - Shell command execution

## [Unreleased]

### Planned
- Rollback functionality for Helm releases
- Release history viewer
- Chart repository management
- Values diff viewer
- Helm install from repository