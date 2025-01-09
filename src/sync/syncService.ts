import * as vscode from 'vscode';
import { GitService } from '../git/gitService';
import { OnFilesChangedCallback, WatcherService } from '../files/watcherService';
import { FilePattern, getConfiguration } from '../utils/configuration';
import { pullExtensions, pushExtensions } from '../utils/extensionUtils';
import * as fs from 'fs';
import path from 'path';
import { copyFile, getFiles, resolveVSCodeVariables } from '../utils/pathUtils';
function log(message: string, ...args: any[]) {
    console.log(`[SyncService] ${message}`, ...args);
}

export class SyncService {
    private syncTimer: NodeJS.Timeout | undefined;
    private extensionsFile: string;
    private extensionWatcherListener: vscode.Disposable | undefined;
    constructor(
        private gitService: GitService,
        private watcherService: WatcherService,
    ) {
        this.extensionsFile = getConfiguration().getContext().globalStorageUri.fsPath + '/extensions.json';
        getConfiguration().getContext().subscriptions.push(this);

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
        log('Sync service initialized successfully');
    }

    public setupSettingsFileWatcher = () => {
        const settingsFsPath = getConfiguration().getUserSettingsPath();
        const globPattern = new vscode.RelativePattern(settingsFsPath, 'settings.json');
        const onSettingsChange = async (uris: Array<vscode.Uri>) => {
            if (uris.length === 0) {
                return;
            }
            console.log('Settings changed', uris);
            await this.teardownWatchers();
            await this.setupWatchers();
        };
        this.watcherService.registerGlobPattern(globPattern, [onSettingsChange]);
    };

    public async setupWatchers() {
        await this.setupExtensionWatcher();
        await this.setupFileWatcher();
        await this.setupPeriodicSync();
        await this.setupSettingsFileWatcher();
    }

    public async teardownWatchers() {
        await this.teardownFileWatcher();
        await this.teardownPeriodicSync();
        if (this.extensionWatcherListener) {
            this.extensionWatcherListener.dispose();
            this.extensionWatcherListener = undefined;
        }
    }

    private async setupFileWatcher() {
        for (const entry of getConfiguration().getFilePatterns()) {
            const globs = entry.patterns.map(pattern => new vscode.RelativePattern(entry.baseDir, pattern));
            log('Watching patterns:', globs);
            const callback: OnFilesChangedCallback = async (uris: Array<vscode.Uri>) => {
                await this.handleFileChange(entry, uris);
            };
            for (const glob of globs) {
                this.watcherService.registerGlobPattern(glob, [callback]);
            }
        }
    }
    private teardownFileWatcher() {
        this.watcherService.clearAllWatchers();
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

    private async handleFileChange(entry: FilePattern, uris: Array<vscode.Uri>): Promise<void> {
        try {
            log('File change detected:', uris);
            for (const uri of uris) {
                const relativePath = path.relative(entry.baseDir, uri.fsPath);
                const remotePath = path.join(entry.remoteDir, relativePath);
                fs.copyFileSync(uri.fsPath, remotePath);
            }
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
    private async copyFilesToRepository(){
        for (const entry of getConfiguration().getFilePatterns()) {
            const files = await getFiles(entry, entry.baseDir);
            for (const file of files) {
                log('Copying file to repository:', file);
                await copyFile(file, path.join(entry.remoteDir, path.relative(entry.baseDir, file)));
            }
        }
    }
    private async copyFilesFromRepository(){
        for (const entry of getConfiguration().getFilePatterns()) {
            const files = await getFiles(entry, entry.remoteDir);
            for (const file of files) {
                log('Copying file from repository:', file);
                await copyFile(file, path.join(entry.baseDir, path.relative(entry.remoteDir, file)));
            }
        }
    }
    private async pushChanges(): Promise<void> {
        await this.copyFilesToRepository();
        await pushExtensions(this.extensionsFile);
        await this.gitService.push();
    }

    private async pullChanges(): Promise<void> {
        await this.gitService.pull();
        const hasRemoteChanges = await this.gitService.hasChanges();
        if (hasRemoteChanges) {
            await pullExtensions(this.extensionsFile);
            await this.copyFilesFromRepository();
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
            await this.copyFilesToRepository();
            await pushExtensions(this.extensionsFile);
            await this.gitService.forcePush();
            log('Force push completed successfully');
        }, 'force push');
    }

    async forcePull(): Promise<void> {
        await this.withSyncLock(async () => {
            await this.gitService.forcePull();
            await pullExtensions(this.extensionsFile);
            await this.copyFilesFromRepository();
            log('Force pull completed successfully');
        }, 'force pull');
    }

    dispose(): void {
        log('Disposing sync service');
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }
        this.teardownWatchers();
        this.watcherService.dispose();
        log('Sync service disposed');
    }

    private async setupExtensionWatcher(): Promise<void> {
        log('Setting up extension watcher');
        if (this.extensionWatcherListener) {
            return;
        }

        this.extensionWatcherListener = vscode.extensions.onDidChange(async () => {
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

        log('Extension watcher setup complete');
    }
} 