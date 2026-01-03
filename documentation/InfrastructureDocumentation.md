# GuidedGenerations-Extension Infrastructure & Source Truth

## 1. Introduction
This document combines the core architectural principles ("Source Truth") and the detailed UI infrastructure of the `GuidedGenerations-Extension` for SillyTavern. It serves as the primary technical reference for the extension's design, operational environment, and implementation details.

## 2. Source Truth (Core Principles)

### 2.1 Operational Environment
- **SillyTavern Integration**: This is a third-party extension for SillyTavern. It relies on SillyTavern's core APIs and DOM structure.
- **Server Isolation**: The SillyTavern server runs as a separate process (often on a different machine) and cannot be started or stopped by the extension's client-side code.
- **Legacy Emulation**: A primary goal is to replicate and enhance the functionality of the "Guided Generations V8" Quick Reply (QR) set within a formal extension framework.

### 2.2 Development Standards
- **Centralized Module Hub**: **CRITICAL**. All imports and exports must flow through [`moduleManager.js`](../scripts/utils/moduleManager.js).
    - Never use complex relative paths like `../../../../extensions.js`.
    - Use the `safeImport` utility for dynamic/asynchronous loading to prevent circular dependencies.
    - This provides a single source of truth for all module resolutions.
- **Debug Logging System**: Use the conditional debug logging system (imported from `moduleManager.js` or `logger.js`).
    - Use `debugLog`, `debugWarn`, and `debugError` for extension-specific information.
    - This allows users to toggle visibility via the `debugMode` setting, keeping the console clean during normal operation.
- **Root-Relative Pathing**: All internal asset loading and module imports should assume the extension's root as the base to ensure consistency across different loading environments.

## 3. Core UI Components

### 3.1 Extension Buttons (Main Interface)
- **Location**: Integrated into the `#send_form` area of the SillyTavern interface.
- **Management**: Handled by `updateExtensionButtons()` in [`uiManager.js`](../scripts/ui/uiManager.js).
- **Structure**:
    - **Primary Container**: `#gg-action-button-container`
    - **Tools Menu**: `#gg_tools_menu` (dynamically populated)
    - **Persistent Guides Menu**: `#pg_tools_menu` (dynamically populated)

### 3.2 Rewrite Infrastructure
- **Context Menu**: Triggered by text selection within `.mes_text` elements. Managed via `processSelection()` and `createGGREwriteMenu()`.
- **Custom Rewrite Popup**: 
    - **HTML**: Loaded from [`customRewritePopup.html`](../html/customRewritePopup.html).
    - **CSS**: Loaded from [`customRewrite.css`](../style/customRewrite.css).
    - **Positioning**: Dynamically calculated by `adjustPopupPosition()` to maintain a 20px offset from the chat boundary.

### 3.3 Target Tracking
- **Target Button**: Added to individual message buttons (`.mes_buttons`). Allows setting a message as the focus for guided generation.

## 4. Architectural Summary

The extension follows a modular, event-driven architecture designed to minimize coupling with SillyTavern's core while maintaining deep integration.

| Component | Responsibility | Primary File |
|-----------|----------------|--------------|
| **Entry Point** | Initial setup and context management | `index.js` |
| **Module Hub** | Import/Export management & Lazy loading | `moduleManager.js` |
| **UI Orchestrator** | DOM manipulation and event routing | `uiManager.js` |
| **Settings** | Configuration state and persistence | `settingsManager.js` |
| **Logger** | Conditional debug output | `logger.js` |

## 5. Adaptation Guidelines (For Other Environments)
To adapt this infrastructure for a different LLM interface:
1. **Remap DOM Targets**: Identify equivalents for `#chat`, `#send_form`, and `.mes_text`.
2. **Re-implement API Hooks**: Replace SillyTavern's `getContext`/`setContext` with the target's state management.
3. **Maintain the Module Hub**: Preserve the `safeImport` pattern to manage the complex dependency graph of the extension's specialized guides and tools.
