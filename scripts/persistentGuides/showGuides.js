/**
 * @file Contains the logic for the Show Guides option in the Persistent Guides menu.
 */

/**
 * Executes the Show Guides script to display all active guides.
 * Shows the content of all active guide injections in a popup.
 */
import { debugLog } from '../utils/exportManager.js'; // Import from central hub

const showGuides = () => {
	debugLog('[ShowGuides] Button clicked');

	const stscriptCommand = `// Display all active guides in a popup|
/listinjects |`;

	debugLog(`[ShowGuides] Executing stscript`);

	// Use the context executeSlashCommandsWithOptions method
	if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
		const context = SillyTavern.getContext();
		try {
			// Send the combined script via context
			context.executeSlashCommandsWithOptions(stscriptCommand, { showOutput: true }); // Show output for user feedback
			debugLog('[ShowGuides] STScript executed.');
		} catch (error) {
			console.error(`[GuidedGenerations] Error executing Show Guides: ${error}`);
		}
	}
};

// Export the function for use in the main extension file
export default showGuides;
