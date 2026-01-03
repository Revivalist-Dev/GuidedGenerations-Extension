# SillyTavern Guided Generations Extension - Scope Definition

## 1. Introduction
This document defines the scope of the SillyTavern Guided Generations extension. It bridges the functionality of the original "Guided Generations V8" Quick Reply (QR) set with the modern, modular infrastructure of a dedicated extension.

## 2. Infrastructure Ecosystem
The extension is built on a "Central Hub" architecture to ensure scalability and prevent the circular dependency issues common in complex SillyTavern extensions.

- **Centralized Module Management**: All features and utilities are orchestrated through [`moduleManager.js`](../scripts/utils/moduleManager.js). This ensures consistent pathing and safe dynamic loading of specialized tools and guides.
- **UI Orchestration**: A dedicated [`uiManager.js`](../scripts/ui/uiManager.js) manages all DOM interactions, ensuring that UI elements (like the Custom Rewrite Popup) are correctly positioned and integrated into the SillyTavern chat interface.
- **Conditional Debugging**: A specialized `logger.js` (integrated into the Hub) provides toggleable debug logging, keeping the user's console clean while providing deep diagnostic capabilities for developers.

## 3. Core Features & Functional Scope

### 3.1 Guided Response Generation
- **Functionality**: Directional AI generation based on user instructions provided in the main input field.
- **Scope**:
    - Context injection using SillyTavern's injection system.
    - Handling of group chats with member selection.
    - Integration with System Features (Clothes, State, Thinking) for automated context enrichment.
    - Automatic input restoration after generation.

### 3.2 Guided Swipe Generation
- **Functionality**: Guidance-based regeneration of the last AI message.
- **Scope**: Targeted injection followed by a swipe command, ensuring the AI incorporates the guidance into a fresh response.

### 3.3 Guided Impersonation
- **Functionality**: AI expansion of user-provided outlines into full first, second, or third-person messages.
- **Scope**: 
    - Support for multiple perspectives (1st, 2nd, 3rd person).
    - Intelligent caching to prevent redundant generation if the outline hasn't changed.

### 3.4 Persistent Guides Management
- **Functionality**: A central system for managing long-term contextual injections that influence the AI over multiple turns.
- **Guides Included**:
    - **Situational Guide**: Generates and maintains context about the current scene.
    - **Rules Guide**: Tracks character-learned or story-mandated rules.
    - **Physical/Mental State**: Automated or manual tracking of character appearance (`Clothes`), physical condition (`State`), and internal monologue (`Thinking`).
    - **Custom Guides**: Direct user input for specialized context.
- **Management Tools**: Popups for viewing, editing, flushing, and listing all active injections.

### 3.5 Specialized Tools
- **Functionality**: Integrated utilities to improve writing quality and chat management.
- **Included Tools**: Spellchecker, Grammar Corrections, Intro Editing, Clear Input, and Message Recovery.

## 4. Architectural Boundaries
- **SillyTavern Core**: The extension interacts with SillyTavern via standard script imports and DOM manipulation. It does not modify SillyTavern core files.
- **Client-Side Only**: All logic is executed within the browser. The extension does not manage the SillyTavern server process.
- **Module Isolation**: Each specialized feature (Rewrite, Impersonate, Guides) is maintained in its own module, lazily loaded by the `moduleManager.js` to minimize initial load weight and memory footprint.

## 5. Conclusion
By consolidating the logic of the original QR set into a modern, hub-based architecture, the Guided Generations extension provides a robust, professional-grade suite of tools for enhancing AI interaction in SillyTavern.
