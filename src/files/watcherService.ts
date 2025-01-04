import * as vscode from 'vscode';
import { Configuration } from '../config/configuration';
import { FileManager } from './fileManager';

function log(message: string, ...args: any[]) {
    console.log(`[WatcherService] ${message}`, ...args);
}

export class WatcherService {
    private disposables: vscode.Disposable[] = [];
    private debounceTimer: NodeJS.Timeout | undefined;

    constructor(
        private fileManager: FileManager,
        private onFileChange: () => Promise<void>
    ) {}

    async setupFileWatcher(): Promise<void> {
        log('Setting up file watcher');
        const userSettingsPath = this.fileManager.getUserSettingsPath();
        log('User settings path:', userSettingsPath);

        const fileConfig = Configuration.getFilePatterns();

        // Create watchers for settings directory patterns
        for (const pattern of fileConfig.patterns) {
            log(`Setting up watcher for pattern: ${pattern}`);
            try {
                const watcher = vscode.workspace.createFileSystemWatcher(
                    new vscode.RelativePattern(userSettingsPath, pattern),
                    false, // Don't ignore create events
                    false, // Don't ignore change events
                    false  // Don't ignore delete events
                );

                // Use a single handler for all events
                watcher.onDidChange(uri => this.handleFileChange(uri));
                watcher.onDidCreate(uri => this.handleFileChange(uri));
                watcher.onDidDelete(uri => this.handleFileChange(uri));

                this.disposables.push(watcher);
                log(`Watcher created successfully for pattern: ${pattern}`);
            } catch (error) {
                log(`Error setting up watcher for pattern ${pattern}:`, error);
            }
        }

        log('File watcher setup complete');
    }

    async handleFileChange(uri: vscode.Uri): Promise<void> {
        log('File change detected:', uri.fsPath);

        const debounceDelay = Configuration.getDebounceDelay();
        log('Debounce delay:', debounceDelay);

        if (this.debounceTimer) {
            log('Clearing existing debounce timer');
            clearTimeout(this.debounceTimer);
        }

        return new Promise<void>((resolve, reject) => {
            log('Setting up new debounce timer');
            this.debounceTimer = setTimeout(async () => {
                log('Debounce timer expired, handling file change');
                try {
                    await this.onFileChange();
                    resolve();
                } catch (error) {
                    log('Error handling file change:', error);
                    reject(error);
                }
            }, debounceDelay);
        });
    }

    dispose(): void {
        log('Disposing watchers');
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.disposables.forEach(d => d.dispose());
        log('Watchers disposed');
    }
} 