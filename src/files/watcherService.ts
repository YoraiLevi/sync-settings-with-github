import * as vscode from 'vscode';
import { getConfiguration } from '../utils/configuration';

function log(message: string, ...args: any[]) {
    console.log(`[WatcherService] ${message}`, ...args);
}

export class WatcherService {
    private disposables: vscode.Disposable[] = [];
    private debounceTimer: NodeJS.Timeout | undefined;
    private onFileChange: Array<(uris: Array<vscode.Uri>) => Promise<void>> = [];
    private changedUris: Set<string> = new Set();
    constructor() {}
    
    public get debounceDelay(): number {
        return getConfiguration().getDebounceDelay();
    }
    
    public listenOnFileChange(onFileChange: (uris: Array<vscode.Uri>) => Promise<void>): (uris: Array<vscode.Uri>) => Promise<void> {
        this.onFileChange.push(onFileChange);
        return onFileChange;
    }

    public removeOnFileChange(onFileChange: (uris: Array<vscode.Uri>) => Promise<void>): void {
        this.onFileChange = this.onFileChange.filter(fn => fn !== onFileChange);
    }

    public watchPatterns(patterns: vscode.GlobPattern[]): void {
        log('Setting up file watcher');

        for (const pattern of patterns) {
            log(`Setting up watcher for pattern: ${pattern}`);
            try {
                const watcher = vscode.workspace.createFileSystemWatcher(
                    pattern,
                    false, // Don't ignore create events
                    false, // Don't ignore change events
                    false  // Don't ignore delete events
                );

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

    public clearAllWatchers(): void {
        log('Clearing all watchers');
        this.onFileChange = [];
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.stopDebounceTimer();
    }
    
    clearChangedUris(): void {
        this.changedUris.clear();
    }

    handleFileChange(uri: vscode.Uri): void {
        log('Debounce delay:', this.debounceDelay);
        this.stopDebounceTimer();
        
        log('File change detected:', uri.fsPath);
        this.changedUris.add(uri.fsPath);
        

        this.debounceTimer = setTimeout(async () => {
            log('Debounce timer expired, handling file change');
            try {
                const uris = Array.from(this.changedUris).map(uri => vscode.Uri.file(uri));
                for (const onFileChange of this.onFileChange) {
                    await onFileChange(uris);
                }
            } catch (error) {
                log('Error handling file change:', error);
            }
            finally {
                this.clearChangedUris();
                this.stopDebounceTimer();
            }
        }, this.debounceDelay);

    }

    public stopDebounceTimer(): void {
        if (this.debounceTimer) {
            log('Clearing existing debounce timer');
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
    }
    
    dispose(): void {
        log('Disposing watchers');
        this.clearAllWatchers();
        log('Watchers disposed');
    }
} 