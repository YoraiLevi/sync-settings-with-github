import * as vscode from 'vscode';

export class Configuration {
    static getFilePatterns(): { patterns: string[], excludePatterns: string[] } {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<{
            patterns: string[];
            excludePatterns: string[];
        }>('files', {
            patterns: ['settings.json', 'keybindings.json'],
            excludePatterns: []
        });
    }

    static getSyncInterval(): number {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<number>('syncInterval', 300) * 1000; // Convert to milliseconds
    }

    static getDebounceDelay(): number {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<number>('debounceDelay', 5) * 1000; // Convert to milliseconds
    }

    static shouldPullOnLaunch(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('pullOnLaunch', true);
    }

    static shouldSyncExtensions(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('extensions.sync', true);
    }

    static shouldAutoRemoveExtensions(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('extensions.autoRemove', false);
    }

    static isAutoSyncEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('autoSync', true);
    }
} 