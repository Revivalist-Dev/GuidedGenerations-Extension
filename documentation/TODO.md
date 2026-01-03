# SillyTavern Guided Generations Extension - TODO List

This list outlines the steps to develop the Guided Generations extension based on the `SCOPE.md`.

**Placement Key:**
*   `(Send)`: Button placed next to the main Send button.
*   `(Menu)`: Item placed inside the left-side Tools Menu (⚙️).
*   `(Panel)`: Item/button placed inside a dedicated modal/panel (e.g., Settings, Persistent Guides).

**Phase 1: Project Setup & Foundation**

1.  [x] **Understand SillyTavern Extension Structure:**
    *   [x] Analyze existing extensions in `References/SillyTavern` (look for patterns: `public/extensions/`, `script.js`, `style.css`, manifests).
    *   [x] Identify extension registration, UI element addition, and core API interaction methods.
2.  [x] **Create Basic Extension Files:**
    *   [x] `script.js` (Main logic)
    *   [x] `style.css` (Styling)
    *   [x] `config.json` / `manifest.json` (If needed)
    *   [x] `README.md` (Initial description)
3.  [x] **Basic UI Integration:**
    *   [x] Register the extension with SillyTavern.
    *   [x] Add a primary UI entry point (e.g., button/menu).

**Phase 2: Core Feature Implementation (Simpler Features)**

4.  [x] **Input Recovery (🛟) `(Menu)`:**
    *   [x] UI element in Tools Menu.
    *   [x] Implement temporary `old_input` storage.
    *   [x] Add UI element to restore `old_input`.
5.  [x] **Simple Send (➕) `(Menu)`:**
    *   [x] UI element in Tools Menu.
    *   [x] Add UI element.
    *   [x] Use SillyTavern API to send message without AI reply.
6.  [x] **Guided Response (🦮) `(Send)`:**
    *   [x] Add UI element next to Send Button.
    *   [x] Store `old_input`.
    *   [x] Use API to inject context (`instruct` ID).
    *   [x] Use API to trigger AI response.
    *   [x] Restore `old_input`.
    *   [x] Add group chat selection logic.
7.  [x] **Guided Swipe (➡️) `(Send)`:**
    *   [x] Add UI element next to Send Button.
    *   [x] Check last message author.
    *   [x] Store `old_input`.
    *   [x] Use API to inject context.
    *   [x] Use API to trigger swipe.
    *   [x] Restore `old_input`.
8.  [x] **Guided Impersonation (✍️, ✍️2, ✍️3) `(Send)`:**
    *   [x] Add UI elements (consider initial visibility) next to Send Button.
    *   [x] Use API for impersonation with correct perspective instructions.
    *   [x] Implement `old_input`/`new_input` check logic.

**Phase 3: Persistent Guides Implementation (Complex)**

9.  [ ] **Persistent State Management:**
    *   [ ] Choose storage mechanism for active guides (e.g., `localStorage`, `sessionStorage`, or SillyTavern's internal state management).
    *   [ ] Map SillyTavern APIs for `inject`, `listinjects`, `flushinjects` to required IDs (`situation`, `thinking`, `clothes`, `state`, `rule_guide`, `Custom`).
10. [ ] **Persistent Guides UI - Main Access `(Menu)`:**
    *   [ ] Add entry point in Tools Menu to open a dedicated panel/modal.
    *   [ ] Create main UI panel/modal for managing persistent guides.
11. [ ] **Show/Flush Guides `(Panel)`:**
    *   [ ] Implement "Show Guides" button inside Persistent Guides panel to display active guides.
    *   [ ] Implement "Flush Guides" button inside Persistent Guides panel to clear all active guides.
12. [ ] **Edit/Custom Guides `(Panel)`:**
    *   [ ] Implement "Edit Guides" button inside Persistent Guides panel for modifying existing guides.
    *   [ ] Implement "Custom Guide" button/area inside Persistent Guides panel to create new custom guides.
13. [ ] **Guide Generation (using `/gen` equivalent) `(Panel)`:**
    *   [ ] Identify SillyTavern API for prompted generation (e.g., a specific `/gen` endpoint or a JavaScript function).
    *   [ ] Implement generation buttons/controls inside Persistent Guides panel for various guide types.
    *   [ ] Handle preset switching if needed for different generation contexts.
    *   [ ] Inject generated content with correct IDs (`situation`, `thinking`, `clothes`, etc.) into the AI context.

**Phase 4: Settings & Finalization**

14. [x] **Settings UI `(Menu)`:**
    *   [x] Create settings UI section/modal, accessed via Tools Menu.
    *   [x] Add toggles `(Panel)` for auto-triggers and impersonation visibility inside Settings panel.
15. [x] **Styling & Polish:**
    *   [ ] Refine UI with `style.css` to ensure a cohesive look and feel.
    *   [x] Style Tools Menu popup and action buttons for better user experience.
    *   [ ] Ensure consistency in styling across all UI elements.
16. [x] **Testing & Debugging:**
    *   [x] Test all features thoroughly, including edge cases and error handling.
    *   [x] Debug identified issues and performance bottlenecks (Selection context loss, Whitespace discrepancies, Swipe synchronization).
17. [x] **Documentation:**
    *   [x] Update `README.md` with final instructions and usage.
    *   [x] Create UI Infrastructure Document.
    *   [x] Create Codebase Rework Document (exports, imports, modification guidance).
    *   [x] Update documentation with recent fixes for selections and swipes.

**Phase 5: Character Description Management (New Feature)**

18. [ ] **Storage Design:**
    *   [ ] Determine storage for: Original (reference), Current Updated, Previous Updated descriptions (e.g., `localStorage` keyed by character ID).
19. [ ] **API Identification:**
    *   [ ] Find API to get original description of the character.
    *   [ ] Find API to get relevant chat history for context.
    *   [ ] Find API/method to override description used by AI (context injection? direct data modification in SillyTavern's state?).
    *   [ ] Find API for LLM generation (`/gen` equivalent within SillyTavern).
20. [ ] **Update Logic Implementation:**
    *   [ ] Develop LLM prompt for intelligent description updates based on chat history.
    *   [ ] Implement logic: Trigger LLM -> Store New (Current Updated) -> Move Old (Current Updated) to Previous Updated.
21. [ ] **Context Override Implementation:**
    *   [ ] Ensure the Current Updated description is prioritized by the AI for its responses.
22. [ ] **Revert Logic Implementation:**
    *   [ ] Implement function to swap Current Updated and Previous Updated descriptions.
    *   [ ] Ensure AI context uses the reverted description.
23. [ ] **UI Elements for Description Update `(Panel)`:**
    *   [ ] Add UI button `(Panel)` to trigger description update from chat context.
    *   [ ] Add UI button `(Panel)` to revert to previous updated description (enable only if a previous version exists).

**Streamlining & General Improvements (Ongoing)**

*   [ ] Review and refactor existing code for better performance and maintainability.
*   [ ] Standardize error handling and logging across modules.
*   [ ] Optimize asset loading and UI rendering for smoother user experience.
*   [ ] Further refine module imports/exports to ensure no hidden circular dependencies and efficient loading.
*   [ ] Explore opportunities to leverage new SillyTavern APIs or best practices from the `public` folder for deeper integration.
*   [ ] Ensure `_currentSelectedText` variable is reset or cleared appropriately after the custom rewrite popup is closed or operation is completed to prevent stale data. This will help with future UI enhancements and reduce potential bugs.

