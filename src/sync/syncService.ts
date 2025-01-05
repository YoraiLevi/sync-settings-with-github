import * as vscode from 'vscode';
import { GitService } from '../git/gitService';
import { WatcherService } from '../files/watcherService';
import { getConfiguration } from '../utils/configuration';
import { pullExtensions, pushExtensions } from '../utils/extensionUtils';
import * as fs from 'fs';
import path from 'path';
import { resolveVSCodeVariables } from '../utils/pathUtils';
function log(message: string, ...args: any[]) {
    console.log(`[SyncService] ${message}`, ...args);
}

export class SyncService {
    private syncTimer: NodeJS.Timeout | undefined;
    private extensionsFile: string;
    private onFileChange: (uris: Array<vscode.Uri>) => Promise<void>;
    constructor(
        private context: vscode.ExtensionContext,
        private gitService: GitService,
        private watcherService: WatcherService,
    ) {
        this.extensionsFile = this.context.globalStorageUri.fsPath + '/extensions.json';
        this.onFileChange = this.watcherService.listenOnFileChange(this.handleFileChange.bind(this));
        this.initialize();
    }

    public get enabled(): boolean {
        return getConfiguration().getSyncEnabled();
    }

    async initialize(): Promise<void> {
        log('Initializing sync service');
        await this.gitService.initialize();
        
        if (getConfiguration().shouldPullOnLaunch()) {
            try {
                log('Performing initial pull of settings');
                await this.gitService.pull();
                
                const hasRemoteChanges = await this.gitService.hasChanges();
                if (hasRemoteChanges) {
                    log('Remote changes detected, copying to settings directory');
                    // await this.fileManager.copyFilesFromWorkingDir();
                    log('Pulling extensions from sync file');
                    await pullExtensions(this.extensionsFile);
                } else {
                    log('No remote changes to apply during initialization');
                }
            } catch (error) {
                log('Error during initial pull:', error);
            }
        }
        
        await this.setupWatchers();
        await this.setupExtensionWatcher();
        log('Sync service initialized successfully');
    }

    public async setupWatchers() {
        await this.setupFileWatcher();
        await this.setupPeriodicSync();
    }

    public async teardownWatchers() {
        await this.teardownFileWatcher();
        await this.teardownPeriodicSync();
    }

    private async setupFileWatcher() {
        for (const entry of getConfiguration().getFilePatterns()) {

            let conditions = entry.conditions || {};
            if (entry.conditions && typeof entry.conditions !== typeof ({})) {
                throw new Error('Conditions are not an object');
            }
            if (entry.conditions) {
                const allConditionsMet = Object.keys(conditions).reduce((result: boolean, condition: string) => {
                    return result && (process.env[condition] === conditions[condition]);
                }, true);
                if (!allConditionsMet) {
                    continue;
                }
            }

            let baseDir = entry.baseDir ? vscode.Uri.file(resolveVSCodeVariables(entry.baseDir)) : getConfiguration().getUserSettingsPath();
            const patterns = entry.patterns.map(pattern => new vscode.RelativePattern(baseDir, pattern));
            log('Watching patterns:', patterns);
            await this.watcherService.watchPatterns(patterns);
        }
    }
    private teardownFileWatcher() {
        this.watcherService.clearAllWatchers();
        this.onFileChange = async (uris: Array<vscode.Uri>) => {};
    }

    private async setupPeriodicSync(): Promise<void> {
        log('Setting up periodic sync');
        const interval = getConfiguration().getSyncInterval();
        log('Sync interval:', interval);

        this.teardownPeriodicSync();

        this.syncTimer = setTimeout(async () => {
            if (this.enabled && getConfiguration().isAutoSyncEnabled()) {
                log('Running periodic sync');
                await this.sync();
                // Setup next sync after current one completes
                await this.setupPeriodicSync();
            }
        }, interval);
        log('Periodic sync setup complete');
    }

    private teardownPeriodicSync() {
        if (this.syncTimer) {
            log('Clearing existing sync timer');
            clearTimeout(this.syncTimer);
            this.syncTimer = undefined;
        }
    }

    private async handleFileChange(uris: Array<vscode.Uri>): Promise<void> {
        try {
            log('File change detected:', uris);
            // await this.fileManager.copyFilesToWorkingDir();
            if (await this.gitService.hasChanges()) {
                log('Changes detected, syncing');
                await this.sync();
            } else {
                log('No changes detected after copying files');
            }
        } catch (error) {
            log('Error during sync after file change:', error);
            throw error;
        }
    }

    private async withSyncLock<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
        if (!this.enabled) {
            log('Sync is disabled');
            return Promise.reject(new Error('Sync is disabled'));
        }

        if (!this.gitService.isInitialized()) {
            throw new Error('Git service not initialized');
        }

        try {
            return await operation();
        } catch (error) {
            const errorMessage = `${operationName} failed: ${error instanceof Error ? error.message : String(error)}`;
            log(`Error during ${operationName}:`, errorMessage);
            vscode.window.showErrorMessage(errorMessage);
            throw new Error(errorMessage);
        }
    }

    private async pushChanges(): Promise<void> {
        // await this.fileManager.copyFilesToWorkingDir();
        await pushExtensions(this.extensionsFile);
        await this.gitService.push();
    }

    private async pullChanges(): Promise<void> {
        await this.gitService.pull();
        const hasRemoteChanges = await this.gitService.hasChanges();
        if (hasRemoteChanges) {
            await pullExtensions(this.extensionsFile);
            // await this.fileManager.copyFilesFromWorkingDir();
        }
    }

    async sync(): Promise<void> {
        await this.withSyncLock(async () => {
            const hasLocalChanges = await this.gitService.hasChanges();
            
            if (hasLocalChanges) {
                log('Local changes detected, preparing to push');
                await this.pushChanges();
            } else {
                log('No local changes, pulling from remote');
                await this.pullChanges();
            }
            
            log('Sync completed successfully');
        }, 'sync');
    }

    async forcePush(): Promise<void> {
        await this.withSyncLock(async () => {
            // await this.fileManager.copyFilesToWorkingDir();
            await pushExtensions(this.extensionsFile);
            await this.gitService.forcePush();
            log('Force push completed successfully');
        }, 'force push');
    }

    async forcePull(): Promise<void> {
        await this.withSyncLock(async () => {
            await this.gitService.forcePull();
            // await this.fileManager.copyFilesFromWorkingDir();
            await pullExtensions(this.extensionsFile);
            log('Force pull completed successfully');
        }, 'force pull');
    }

    dispose(): void {
        log('Disposing sync service');
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }
        this.watcherService.removeOnFileChange(this.onFileChange);
        this.watcherService.dispose();
        log('Sync service disposed');
    }

    private async setupExtensionWatcher(): Promise<void> {
        log('Setting up extension watcher');
        
        const extensionWatcher = vscode.extensions.onDidChange(async () => {
            log('Extension change detected');
            if (!this.enabled || !getConfiguration().shouldSyncExtensions()) {
                return;
            }

            try {
                log('Extension change detected, pushing to sync file');
                await pushExtensions(this.extensionsFile);
                
                if (await this.gitService.hasChanges()) {
                    log('Changes detected in extensions file, pushing to remote');
                    await this.gitService.push();
                    log('Extension changes pushed successfully');
                } else {
                    log('No changes in extensions file to push');
                }
            } catch (error) {
                log('Error handling extension change:', error);
            }
        });

        this.context.subscriptions.push(extensionWatcher);
        log('Extension watcher setup complete');
    }
} 