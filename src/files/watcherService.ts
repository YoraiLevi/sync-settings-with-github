import * as vscode from 'vscode';
import { getConfiguration, FilePattern } from '../utils/configuration';
import { resolveVSCodeVariables } from '../utils/pathUtils';
import { GlobPattern } from 'vscode';

function log(message: string, ...args: any[]) {
    console.log(`[WatcherService] ${message}`, ...args);
}
export type OnFilesChangedCallback = (uris: Array<vscode.Uri>) => Promise<void>;

interface IWatchedPatternRelatedObjects {
    watchers: vscode.Disposable[];
    changedUris: Set<string>;
    onFilesChangedCallbacks: Array<OnFilesChangedCallback>;
}
export class WatcherService {
    private watchedPatterns: Map<GlobPattern, IWatchedPatternRelatedObjects> = new Map();
    private debounceTimer: NodeJS.Timeout | undefined;

    constructor() { }

    public get debounceDelay(): number {
        return getConfiguration().getDebounceDelay();
    }

    public addPatternOnFilesChangedCallback(pattern: GlobPattern, onFileChange: OnFilesChangedCallback): OnFilesChangedCallback {
        if (!this.watchedPatterns.has(pattern)) {
            this.watchedPatterns.set(pattern, {
                watchers: [],
                changedUris: new Set(),
                onFilesChangedCallbacks: []
            });
        }
        this.watchedPatterns.get(pattern)?.onFilesChangedCallbacks.push(onFileChange);
        log('Total callbacks for pattern:', pattern, 'is now:', this.watchedPatterns.get(pattern)?.onFilesChangedCallbacks.length);
        return onFileChange;
    }

    public removePatternOnFilesChangedCallback(pattern: GlobPattern, onFileChange: OnFilesChangedCallback): void {
        const patternData = this.watchedPatterns.get(pattern);
        if (patternData) {
            const beforeLength = patternData.onFilesChangedCallbacks.length;
            patternData.onFilesChangedCallbacks = patternData.onFilesChangedCallbacks.filter(fn => fn !== onFileChange);
            log('Removed callbacks:', beforeLength - patternData.onFilesChangedCallbacks.length);
        } else {
            log('No pattern data found for:', pattern);
        }
    }

    public clearAllPatternOnFilesChangedCallbacks(pattern: GlobPattern): void {
        log('Clearing all callbacks for pattern:', pattern);
        const callbacks = this.watchedPatterns.get(pattern)?.onFilesChangedCallbacks.length || 0;
        this.watchedPatterns.get(pattern)?.onFilesChangedCallbacks.forEach(callback => this.removePatternOnFilesChangedCallback(pattern, callback));
        log('Cleared callbacks count:', callbacks);
    }

    public unregisterPattern(pattern: GlobPattern): void {
        log('Unregistering pattern:', pattern);
        this.clearWatchers(pattern);
        this.watchedPatterns.delete(pattern);
        log('Pattern unregistered:', pattern);
    }

    public clearWatchers(pattern: GlobPattern) {
        log('Clearing watchers for pattern:', pattern);
        const patternData = this.watchedPatterns.get(pattern);
        if (patternData) {
            log('Found', patternData.watchers.length, 'watchers to dispose');
            patternData.watchers.forEach(watcher => watcher.dispose());
            patternData.watchers = [];
            log('All watchers cleared for pattern:', pattern);
        } else {
            log('No watchers found for pattern:', pattern);
        }
    }

    public registerGlobPattern(pattern: GlobPattern, onFilesChangedCallbacks: Array<OnFilesChangedCallback>): void {
        log('Registering new glob pattern:', pattern, 'with', onFilesChangedCallbacks.length, 'callbacks');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidChange((uri) => this.handleFileChange(pattern, uri));
        watcher.onDidCreate((uri) => this.handleFileChange(pattern, uri));
        watcher.onDidDelete((uri) => this.handleFileChange(pattern, uri));
        if (!this.watchedPatterns.has(pattern)) {
            this.watchedPatterns.set(pattern, {
                watchers: [],
                changedUris: new Set(),
                onFilesChangedCallbacks: []
            });
        }
        this.watchedPatterns.get(pattern)?.watchers.push(watcher);
        for (const callback of onFilesChangedCallbacks) {
            this.addPatternOnFilesChangedCallback(pattern, callback);
        }
    }

    public clearAllWatchers(): void {
        log('Clearing all watchers');
        this.watchedPatterns.forEach((patternData, pattern) => {
            this.unregisterPattern(pattern);
        });
        this.watchedPatterns.clear();
        this.stopDebounceTimer();
    }

    clearChangedUris(pattern?: GlobPattern): void {
        if (pattern) {
            this.watchedPatterns.get(pattern)?.changedUris.clear();
        } else {
            this.watchedPatterns.forEach(patternData => {
                patternData.changedUris.clear();
            });
        }
    }
    private async processFileChanges() {
        for (const pattern of this.watchedPatterns.keys()) {
            try {
                const uris = Array.from(this.watchedPatterns.get(pattern)?.changedUris || []);
                if (uris.length > 0) {
                    log('Processing', uris.length, 'changed files', 'for pattern:', pattern);
                    const callbacks = this.watchedPatterns.get(pattern)?.onFilesChangedCallbacks || [];
                    log('Executing', callbacks.length, 'callbacks', 'for pattern:', pattern);

                    for (const listener of callbacks) {
                        log('Executing callback for', uris.length, 'files', 'for pattern:', pattern);
                        await listener(uris.map(uri => vscode.Uri.file(uri)));
                    }
                    log('All callbacks executed successfully', 'for pattern:', pattern);
                }
            } catch (error) {
                log('Error processing file changes:', error, 'for pattern:', pattern);
                console.error(error);
            } finally {
                log('Clearing changed URIs for pattern:', pattern);
                this.clearChangedUris(pattern);
            }
        }
    }
    private handleFileChange(pattern: GlobPattern, uri: vscode.Uri): void {
        log('File change detected for pattern:', pattern);
        log('Changed file:', uri.fsPath);
        log('Current debounce delay:', this.debounceDelay);

        this.stopDebounceTimer();

        const patternData = this.watchedPatterns.get(pattern);
        const previousChanges = patternData?.changedUris.size || 0;
        patternData?.changedUris.add(uri.fsPath);
        log('Total pending changes:', patternData?.changedUris.size, '(added from', previousChanges, ')');

        this.debounceTimer = setTimeout(async () => {
            log('Debounce timer expired, processing changes');
            try {
                await this.processFileChanges();
            } catch (error) { throw error; }
            finally {
                this.stopDebounceTimer();
                log('Finished processing file changes');
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

    public dispose(): void {
        log('Disposing watchers');
        this.clearAllWatchers();
        log('Watchers disposed');
    }
} 