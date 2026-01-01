export const extensionName = "GuidedGenerations-Extension";

export const defaultSettings = {
    autoTriggerClothes: false,
    autoTriggerState: false,
    autoTriggerThinking: false,
    enableAutoCustomAutoGuide: false,
    showImpersonate: true,
    impersonateTemplate: '1st',
    showGuidedContinue: false,
    showGuidedResponse: true,
    showGuidedSwipe: true,
    showSimpleSendButton: false,
    showRecoverInputButton: false,
    showEditIntrosButton: false,
    showCorrectionsButton: false,
    showSpellcheckerButton: false,
    showClearInputButton: false,
    showUndoButton: false,
    showRevertButton: false,
    integrateQrBar: true,
    debugMode: false,
    persistentGuidesInChatlog: true,
    injectionEndRole: 'system',
    contextMessageCount: 0,
    profileRewrite: '',
    presetRewrite: '',
    promptRewrite: '[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style and length. Do not list alternatives and only print the result without prefix or suffix.[/INST]',
    promptShorten: '[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style. Do not list alternatives and only print the result without prefix or suffix. Shorten it by roughly 20%.[/INST]',
    promptExpand: '[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style. Do not list alternatives and only print the result without prefix or suffix. Lengthen it by roughly 20%.[/INST]',
    promptCustom: '[INST]Rewrite this section of text: """{{rewrite}}""" according to the following instructions: "{{input}}". Keep the general style. Do not list alternatives and only print the result without prefix or suffix.[/INST]',
    highlightDuration: 3000,
    
    // Profile and Preset settings for each guide
    profileClothes: '', presetClothes: '', profileClothesApiType: '',
    profileState: '', presetState: '', profileStateApiType: '',
    profileThinking: '', presetThinking: '', profileThinkingApiType: '',
    profileSituational: '', presetSituational: '', profileSituationalApiType: '',
    profileRules: '', presetRules: '', profileRulesApiType: '',
    profileCustom: '', presetCustom: '', profileCustomApiType: '',
    profileCorrections: '', presetCorrections: '', profileCorrectionsApiType: '',
    profileSpellchecker: '', presetSpellchecker: '', profileSpellcheckerApiType: '',
    profileEditIntros: '', presetEditIntros: '', profileEditIntrosApiType: '',
    profileCustomAuto: '', presetCustomAuto: '', profileCustomAutoApiType: '',
    usePresetCustomAuto: false,
    profileFun: '', presetFun: '', profileFunApiType: '',
    profileTrackerDetermine: '', presetTrackerDetermine: '', profileTrackerDetermineApiType: '',
    profileTrackerUpdate: '', presetTrackerUpdate: '', profileTrackerUpdateApiType: '',

    // Prompt Overrides
    promptClothes: '[OOC: Answer me out of Character! Don\'t continue the RP.  Considering where we are currently in the story, write me a list entailing the clothes and look, what they are currently wearing of all participating characters, including {{user}}, that are present in the current scene. Don\'t mention people or clothing pieces no longer relevant to the ongoing scene.] ',
    promptState: '[OOC: Answer me out of Character! Don\'t continue the RP.  Considering the last response, write me a list entailing what state and position of all participating characters, including {{user}}, that are present in the current scene. Don\'t describe their clothes or how they are dressed. Don\'t mention people no longer relevant to the ongoing scene.] ',
    promptThinking: '[OOC: Answer me out of Character! Don\'t continue the RP.  Write what each characters in the current scene are currently thinking, pure thought only. Do NOT continue the story or include narration or dialogue. Do not include the{{user}}\'s thoughts.] ',
    promptSituational: '[OOC: Answer me out of Character! Don\'t continue the RP.  Analyze the chat history and provide a concise summary of: 1. Current location and setting (indoors/outdoors, time of day, weather if relevant) 2. Present characters and their current activities 3. Relevant objects, items, or environmental details that could influence interactions 4. Recent events or topics of conversation (last 10-20 messages) Keep the overview factual and neutral without speculation. Format in clear paragraphs.] ',
    promptRules: '[OOC: Answer me out of Character! Don\'t continue the RP.  Create a list of explicit rules that {{char}} has learned and follows from the story and their character description. Only include rules explicitly established in chat history or character info. Format as a numbered list.] ',
    promptCorrections: '[OOC: Answer me out of Character! Don\'t continue the RP.  Do not continue the story do not wrote in character, instead write {{char}}\'s last response (msgtorework) again but change it to reflect the following: {{input}}. Don\'t make any other changes besides this.]',
    promptSpellchecker: 'Without any intro or outro correct the grammar, punctuation and improve the paragraph\'s flow without adding anything else of: {{input}}',
    promptGuidedResponse: '[Take the following into special consideration for your next message: {{input}}]',
    promptGuidedSwipe: '[Take the following into special consideration for your next message: {{input}}]',
    promptGuidedContinue: '[Continue the story based on the following input: {{input}}]',
    customAutoGuidePrompt: '',

    // Raw Flags
    rawPromptClothes: false, rawPromptState: false, rawPromptThinking: false, rawPromptSituational: false,
    rawPromptRules: false, rawPromptCorrections: false, rawPromptSpellchecker: false, rawPromptCustomAuto: false,

    // Depths
    depthPromptClothes: 1, depthPromptState: 1, depthPromptThinking: 0, depthPromptSituational: 1,
    depthPromptRules: 0, depthPromptCorrections: 0, depthPromptGuidedResponse: 0, depthPromptGuidedSwipe: 0,
    depthPromptCustomAuto: 1,

    LastPatchNoteVersion: '1.4.3'
};
