// Global test setup
import { createPinia, setActivePinia } from 'pinia';
import * as _ from 'lodash';

// Make lodash available globally as it's used in the source code
(globalThis as any)._ = _;

// Provide a default SillyTavern mock so Pinia stores can read/write settings
(globalThis as any).SillyTavern = {
    extensionSettings: {},
    saveSettingsDebounced: jest.fn(),
    saveChat: jest.fn().mockResolvedValue(undefined),
    callGenericPopup: jest.fn().mockResolvedValue(undefined),
    ToolManager: {
        isToolCallingSupported: jest.fn().mockReturnValue(true),
        parseToolCalls: jest.fn((toolCalls: unknown, parsed: unknown) => ({ toolCalls, parsed })),
        registerFunctionTool: jest.fn(),
        unregisterFunctionTool: jest.fn(),
    },
    registerMacro: jest.fn(),
    unregisterMacro: jest.fn(),
    chatCompletionSettings: { function_calling: true },
    chat: [],
    extension_settings: {},
};

(globalThis as any).appendInexistentScriptButtons = jest.fn();
(globalThis as any).getButtonEvent = jest.fn((button_name: string) => button_name);
(globalThis as any).eventOnButton = jest.fn();

// Mock window object
(globalThis as any).window = globalThis;

// Mock TavernHelper
(globalThis as any).window.TavernHelper = {
    substitudeMacros: jest.fn(input => input),
};

// Mock tavern events
(globalThis as any).tavern_events = {
    GENERATION_ENDED: 'GENERATION_ENDED',
    MESSAGE_SENT: 'MESSAGE_SENT',
    GENERATION_STARTED: 'GENERATION_STARTED',
};

// Ensure each test runs with a fresh Pinia instance
beforeEach(() => {
    setActivePinia(createPinia());
});

// Mock functions that are not available in test environment
(globalThis as any).eventOn = jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
    const bridged = (globalThis as any).eventOnButton;
    if (typeof bridged === 'function') {
        bridged(event, handler);
    }
});
(globalThis as any).eventEmit = jest.fn();
(globalThis as any).getChatMessages = jest.fn();
(globalThis as any).getVariables = jest.fn();
(globalThis as any).getLastMessageId = jest.fn();
(globalThis as any).replaceVariables = jest.fn();
(globalThis as any).setChatMessage = jest.fn();
(globalThis as any).getCurrentCharPrimaryLorebook = jest.fn();
(globalThis as any).getAvailableLorebooks = jest.fn();
(globalThis as any).substitudeMacros = jest.fn(input => input);
