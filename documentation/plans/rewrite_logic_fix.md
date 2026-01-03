# Plan: Enforce Raw Edit Mode for Guided Rewrite

The user has explicitly directed a major pivot: **Abandon all logic that attempts to map rendered text to raw text.** Instead, we must strictly enforce a workflow where the user *must* be in "Edit Mode" (editing the raw message) to use the Guided Rewrite features. This ensures 100% accuracy and eliminates the complexity of markdown parsing.

## 1. Requirement Analysis
- **Constraint:** "Remove all older logic." No more DOM walking, no more fuzzy regex matching.
- **Workflow:**
    1.  User MUST select a message using the "Targeted Message" feature (which implies entering the edit view for that message).
    2.  User selects text *inside* the raw edit textarea.
    3.  User triggers the Rewrite Context Menu.
    4.  Extension reads the exact `selectionStart` / `selectionEnd` from the textarea.
    5.  Rewrite is applied to the raw string.
    6.  Diff View shows the change.
- **UI Requirement:** Move the "Set as Guided Generation Target" button.
    - **Current:** Hidden inside `.extraMesButtons` (the kebab menu).
    - **New:** Visible directly in `.mes_buttons`, adjacent to the Edit button (`.mes_edit`).

## 2. Technical Implementation

### A. Cleanup (`guidedRewrite.js`)
- **Delete:** `findRoughMatch`.
- **Delete:** The complex DOM traversal in `getSelectedTextInfo`.
- **Delete:** `occurrenceIndex` logic.

### B. New `getSelectedTextInfo` Logic
- **Check 1:** Is the active element a `textarea` or `input`?
- **Check 2:** Does it have a selection?
- **Action:** If yes, return:
    - `mesId` (We need to find which message this textarea belongs to. Usually, the textarea replaces the message content, so we look up the DOM tree for `.mes`).
    - `fullMessage`: `element.value`.
    - `start`: `element.selectionStart`.
    - `end`: `element.selectionEnd`.
    - `selectedText`: `element.value.substring(start, end)`.
- **Fallback:** If not in a textarea, return `null` or show a UI warning: "Please edit the message to select raw text."

### C. Refactor `performRewrite` & `applyRewriteChange`
- **Simplify:** Remove all logic that tries to "find" the text.
- **Direct Application:**
    - `newMessage = fullMessage.substring(0, start) + resultText + fullMessage.substring(end)`
- **Integration:** The `applyRewriteChange` function needs to update the *textarea value* directly if it's still open, so the user sees the change immediately in the editor.
    - *Crucial:* If we only update `chat[mesId]`, the open textarea might not reflect it, or saving the textarea later might overwrite our change.
    - **Strategy:** Update the textarea's value *and* trigger an `input` event so SillyTavern knows it changed.

### D. UI/UX "Targeted Message"
- **Task:** Move the `.guided_target_button` in the DOM.
- **Implementation:** This likely happens in the main script setup or an event listener that injects buttons. I need to find where `guided_target_button` is currently injected and change its target container from `.extraMesButtons` to `.mes_buttons`, inserting it before/after `.mes_edit`.
- **File:** `GuidedGenerations-Extension/scripts/ui/uiManager.js` (or similar UI script).

## 3. Revised Todo List

### Phase 1: Logic Simplification (Code Mode)
- [ ] **Strip `guidedRewrite.js`**: Remove `findRoughMatch`, regex logic, and complex DOM walkers.
- [ ] **Implement Strict `getSelectedTextInfo`**:
    - Only accept selections from `textarea`/`input`.
    - Walk up DOM to find `mesId` (attribute `mesid` on parent `.mes`).
    - Return precise start/end indices.
- [ ] **Update `performRewrite`**:
    - Use strict indices for replacement.
    - Remove "profile switching" if it's not relevant to the raw text (or keep it if it affects generation).

### Phase 2: Editor Integration (Code Mode)
- [ ] **Update `applyRewriteChange`**:
    - Detect if the textarea is still the active element.
    - If so, update `textarea.value` directly.
    - Dispatch `new Event('input', { bubbles: true })` to sync with SillyTavern's state.
    - *Also* update `chat[mesId]` as a backup/sync measure.
- [ ] **Verify Diff View**:
    - Ensure it works with the raw text strings.

### Phase 3: UI Adjustments (Code Mode)
- [ ] **Move Target Button**:
    - Locate the button injection code.
    - Change target from `.extraMesButtons` to `.mes_buttons`.
    - Position it adjacent to the edit button.

### Phase 4: Verification (Debug Mode)
- [ ] **Test Workflow**:
    - Click "Edit" on a message.
    - Select text in the box.
    - Click "Rewrite".
    - Verify text changes in the box.
    - Verify "Diff View" works.
    - Verify saving the message preserves the change.

## 4. Execution Order
1.  **Code Mode**: Overhaul `guidedRewrite.js` to enforce the "Edit Mode Only" constraint.
2.  **Code Mode**: Move the UI button.
3.  **Verify**: Test the flow within the user's constraints.


