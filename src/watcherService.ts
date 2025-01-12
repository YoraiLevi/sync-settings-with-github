import * as vscode from 'vscode';
import { getConfiguration, FilePattern } from './utils/configuration';
import { resolveVSCodeVariables } from './utils/pathUtils';
import { GlobPattern } from 'vscode';
import { createLogger, LogLevel } from './utils/logUtils';

const log = createLogger({
    serviceName: 'WatcherService',
    minLevel: LogLevel.INFO
});

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
        log.debug('Total callbacks for pattern:', pattern, 'is now:', this.watchedPatterns.get(pattern)?.onFilesChangedCallbacks.length);
        return onFileChange;
    }

    public removePatternOnFilesChangedCallback(pattern: GlobPattern, onFileChange: OnFilesChangedCallback): void {
        const patternData = this.watchedPatterns.get(pattern);
        if (patternData) {
            const beforeLength = patternData.onFilesChangedCallbacks.length;
            patternData.onFilesChangedCallbacks = patternData.onFilesChangedCallbacks.filter(fn => fn !== onFileChange);
            log.debug('Removed callbacks:', beforeLength - patternData.onFilesChangedCallbacks.length);
        } else {
            log.warn('No pattern data found for:', pattern);
        }
    }

    public clearAllPatternOnFilesChangedCallbacks(pattern: GlobPattern): void {
        log.debug('Clearing all callbacks for pattern:', pattern);
        const callbacks = this.watchedPatterns.get(pattern)?.onFilesChangedCallbacks.length || 0;
        this.watchedPatterns.get(pattern)?.onFilesChangedCallbacks.forEach(callback => this.removePatternOnFilesChangedCallback(pattern, callback));
        log.debug('Cleared callbacks count:', callbacks);
    }

    public unregisterPattern(pattern: GlobPattern): void {
        log.debug('Unregistering pattern:', pattern);
        this.clearWatchers(pattern);
        this.watchedPatterns.delete(pattern);
        log.debug('Pattern unregistered:', pattern);
    }

    public clearWatchers(pattern: GlobPattern) {
        log.info('Clearing watchers for pattern:', pattern);
        const patternData = this.watchedPatterns.get(pattern);
        if (patternData) {
            log.debug('Found', patternData.watchers.length, 'watchers to dispose');
            patternData.watchers.forEach(watcher => watcher.dispose());
            patternData.watchers = [];
            log.debug('All watchers cleared for pattern:', pattern);
        } else {
            log.warn('No watchers found for pattern:', pattern);
        }
    }

    public registerGlobPattern(pattern: GlobPattern, onFilesChangedCallbacks: Array<OnFilesChangedCallback>): void {
        log.info('Registering new glob pattern:', pattern, 'with', onFilesChangedCallbacks.length, 'callbacks');
        
        if (!this.watchedPatterns.has(pattern)) {
            this.watchedPatterns.set(pattern, {
                watchers: [],
                changedUris: new Set(),
                onFilesChangedCallbacks: []
            });
        }

        const patternData = this.watchedPatterns.get(pattern);
        if (!patternData) {
            log.error('Failed to initialize pattern data for:', pattern);
            return;
        }

        patternData.onFilesChangedCallbacks.push(...onFilesChangedCallbacks);

        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        patternData.watchers.push(watcher);

        watcher.onDidChange((uri) => this.handleFileChange(pattern, uri));
        watcher.onDidCreate((uri) => this.handleFileChange(pattern, uri));
        watcher.onDidDelete((uri) => this.handleFileChange(pattern, uri));

        log.debug('Glob pattern registered successfully:', pattern);
    }

    public clearAllWatchers(): void {
        log.info('Clearing all watchers');
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
    private async processFileChanges(): Promise<void> {
        log.debug('Processing pending file changes');
        for (const [pattern, patternData] of this.watchedPatterns.entries()) {
            if (patternData.changedUris.size === 0) {
                continue;
            }

            const uris = Array.from(patternData.changedUris).map(uri => vscode.Uri.file(uri));
            log.debug('Processing', uris.length, 'changed files for pattern:', pattern);

            for (const callback of patternData.onFilesChangedCallbacks) {
                try {
                    await callback(uris);
                } catch (error) {
                    log.error('Error processing file changes:', error, 'for pattern:', pattern);
                }
            }

            patternData.changedUris.clear();
        }
        log.debug('Finished processing file changes');
    }
    private handleFileChange(pattern: GlobPattern, uri: vscode.Uri): void {
        log.debug('File change detected for pattern:', pattern);
        log.trace('Changed file:', uri.fsPath);
        log.trace('Current debounce delay:', this.debounceDelay);

        this.stopDebounceTimer();

        const patternData = this.watchedPatterns.get(pattern);
        if (!patternData) {
            log.warn('No pattern data found for:', pattern);
            return;
        }

        const previousChanges = patternData.changedUris.size;
        patternData.changedUris.add(uri.fsPath);
        log.trace('Total pending changes:', patternData.changedUris.size, '(added from', previousChanges, ')');

        this.debounceTimer = setTimeout(async () => {
            log.debug('Debounce timer expired, processing changes');
            try {
                await this.processFileChanges();
            } catch (error) {
                log.error('Failed to process file changes:', error);
                throw error;
            } finally {
                this.stopDebounceTimer();
                log.debug('Finished processing file changes');
            }
        }, this.debounceDelay);
    }

    public stopDebounceTimer(): void {
        if (this.debounceTimer) {
            log.debug('Clearing existing debounce timer');
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
    }

    public dispose(): void {
        log.info('Disposing WatcherService');
        this.clearAllWatchers();
        log.info('WatcherService disposed');
    }
} 