# Guided Generations Extension for SillyTavern

This extension brings the full power of the original "Guided Generations" Quick Reply set to SillyTavern as a native extension. It provides modular, context-aware tools for shaping, refining, and guiding AI responses—ideal for roleplay, story, and character-driven chats. All features are accessible via intuitive buttons and menus integrated into the SillyTavern UI.

See [`JSDoc.md`](./JSDoc.md) for code-level documentation.

---

## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Settings](#settings)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Contributing](#contributing)

---

## Features

### 🎯 Manual Message Targeting (NEW!)
*Select any message in the chat as the focal point for guided tools.*
- A **crosshair button** (🎯) now appears on every message.
- Click it to set that message as the "Target".
- All guided tools (Response, Continue, Swipe, Impersonate) will now use that message's historical position as their context, ignoring any subsequent messages (like automated summaries or roadway info).
- Visual indicators show which message is currently targeted.

### 🐕 Guided Response
*Inject instructions before the AI replies.*
- Type instructions and press 🐕.
- Your instructions guide the next AI response.
- Now respects the manual target and context limits.

### 👈 Guided Swipe
*Regenerate any message (AI or User) with new guidance.*
- Enter instructions and press 👈 to generate a new version of the message.
- **Support for Historical Swipes:** Now works reliably on older messages by temporarily focusing the AI's context on that specific point in time.
- **User Message Swiping:** Special logic generates new versions of user messages using your current persona.

### 👤 Guided Impersonate (Consolidated)
*Expand outlines using customizable perspective templates.*
- Enter a brief outline and press 👤.
- **Dynamic Templates:** Choose from 1st, 2nd, 3rd person, or custom templates (stored in `impersonateTemplates.json`).
- Automatically inherits the correct persona name for consistent swiping.

### 📖 Persistent Guides Menu
*Manage persistent scenario context.*
- Click the 📖 button to open the persistent guides menu.
- Select a guide type to generate or manage context.
- **Stat Tracker:** Monitor and update character stats or story variables automatically.

**Guide Types:**
  - 🗺️ Situational, 🧠 Thinking, 👕 Clothes, 🧍 State, 📜 Rules, ➕ Custom, 🎮 Fun.

**Management Actions:**
  - ✏️ Edit Guides: Modify existing guide injections via popup.
  - 👁️ Show Guides: Display all active guides.
  - 🗑️ Flush Guides: Remove selected or all guides.
- Auto-trigger for Thinking, Clothes, and State can be toggled in settings.

### 🔖 Tools Menu
*Access additional utilities*
  - **🔧 Corrections:** Edit the last AI message with targeted instructions.
  - **✅ Spellchecker:** Polish your input for grammar, punctuation, and flow.
  - **✈️ Simple Send:** Send input as a user message without triggering a model response.
  - **🖋️ Edit Intros:** Rewrite or transform introductory messages on demand.
  - **↩️ Input Recovery:** Restore previously cleared input.

---

## Installation

1. **Install the Extension:**
   - In the Extensionmanager click on Install Extension and enter https://github.com/Samueras/GuidedGenerations-Extension/ as the GITHUB


---

## Usage

- All main features appear as buttons next to the send button or in the left-side gear menu.
- Hover tooltips and context menus provide guidance and quick access to advanced features.
- See in-app settings for feature toggles and auto-guide configuration.
- For full technical details, see [`JSDoc.md`](./JSDoc.md).

---

## ⚙️ Settings

- **Context Message Limit (NEW!):** Restrict how many previous messages are included as context for generations (0 for all). This helps focus the AI and manage token usage.
- **Impersonate Template (NEW!):** Choose your default perspective template (1st, 2nd, 3rd, or custom) for the Guided Impersonate tool.
- **Auto-Trigger**: Toggle automatic execution of Thinking, State, and Clothes guides before each response.
- **Buttons Visibility**: Choose which action buttons to display in the UI.
- **Injection Role**: Select the role (`system`, `assistant`, or `user`) used for injected guidance.
- **Presets & Profiles**: Assign specific SillyTavern presets or profiles to each individual tool, allowing the extension to automatically switch models/parameters based on the task.

---

## Troubleshooting

- **Missing Buttons:** Ensure SillyTavern is up to date (v1.12.9+) and LALib is installed/enabled.
- **Context Menus Not Appearing:** Try switching chats or re-adding the extension in the Quick Replies menu.
- **Other Issues:** Restart SillyTavern, check for updates, and consult the [SillyTavern documentation](https://github.com/SillyTavern/SillyTavern).

---

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.

---

## Contributing

Contributions are welcome! Submit pull requests or open issues for improvements, features, or documentation. For questions or feedback, open an issue in this repository.

---

## ❤️ Support the Project

If you find this extension helpful, please consider supporting my work:

- [☕ Buy me a coffee on Ko-fi](https://ko-fi.com/samueras)
