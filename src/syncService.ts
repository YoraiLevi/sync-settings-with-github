import * as vscode from 'vscode';
import { GitService } from './gitService';
import { OnFilesChangedCallback, WatcherService } from './watcherService';
import { FilePattern, getConfiguration } from './utils/configuration';
import { pullExtensions, pushExtensions } from './utils/extensionUtils';
import * as fs from 'fs';
import * as path from 'path';
import { copyFile, getFiles, resolveVSCodeVariables } from './utils/pathUtils';
import { createLogger, LogLevel } from './utils/logUtils';

const log = createLogger({
    serviceName: 'SyncService',
    minLevel: LogLevel.INFO
});

export class SyncService {
    private syncTimer: NodeJS.Timeout | undefined;
    private extensionsFile: string;
    private extensionWatcherListener: vscode.Disposable | undefined;
    constructor(
        private gitService: GitService,
        private watcherService: WatcherService,
    ) {
        this.extensionsFile = path.join(this.gitService.gitDirectory,getConfiguration().getExtensionFileRemoteDir(), 'extensions.json');
        getConfiguration().getContext().subscriptions.push(this);

        this.initialize();
    }

    public get enabled(): boolean {
        return getConfiguration().getSyncEnabled();
    }
    async initialize(): Promise<void> {
        log.info('Initializing sync service');
        await this.gitService.ensureInitialized();

        if (getConfiguration().shouldPullOnLaunch()) {
            try {
                log.info('Performing initial pull of settings');
                await this.gitService.pull();

                const hasRemoteChanges = await this.gitService.hasChanges();
                if (hasRemoteChanges) {
                    log.info('Remote changes detected, copying to settings directory');
                    await pullExtensions(this.extensionsFile);
                    log.debug('Extensions pulled from sync file');
                } else {
                    log.debug('No remote changes to apply during initialization');
                }
            } catch (error) {
                log.error('Error during initial pull:', error);
            }
        }
        await this.setupWatchers();
        log.info('Sync service initialized successfully');
    }

    public setupSettingsFileWatcher = () => {
        const settingsFsPath = getConfiguration().getUserSettingsPath();
        const globPattern = new vscode.RelativePattern(settingsFsPath, 'settings.json');
        const onSettingsChange = async (uris: Array<vscode.Uri>) => {
            if (uris.length === 0) {
                return;
            }
            log.info('Settings changed:', uris);
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
            log.debug('Watching patterns:', globs);
            const callback: OnFilesChangedCallback = async (uris: Array<vscode.Uri>) => {
                await this.handleFileChange(entry, uris);
            };
            for (const glob of globs) {
                this.watcherService.registerGlobPattern(glob, [callback]);
            }
        }
    }
    private async teardownFileWatcher() {
        log.debug('Tearing down file watcher');
        this.watcherService.clearAllWatchers();
    }

    private async setupPeriodicSync() {
        const syncInterval = getConfiguration().getSyncInterval();
        if (!syncInterval) {
            log.debug('Periodic sync is disabled');
            return;
        }

        log.info('Setting up periodic sync with interval:', syncInterval, 'ms');
        this.syncTimer = setInterval(async () => {
            try {
                log.debug('Running periodic sync');
                await this.gitService.pull();
                await pullExtensions(this.extensionsFile);
                log.info('Periodic sync completed successfully');
            } catch (error) {
                log.error('Error during periodic sync:', error);
            }
        }, syncInterval);
    }

    private async teardownPeriodicSync() {
        if (this.syncTimer) {
            log.debug('Clearing sync timer');
            clearInterval(this.syncTimer);
            this.syncTimer = undefined;
        }
    }

    private async handleFileChange(pattern: FilePattern, uris: Array<vscode.Uri>) {
        if (!this.enabled) {
            log.debug('Sync is disabled, ignoring file changes');
            return;
        }

        try {
            log.info('Processing file changes:', uris.length, 'files changed');
            await this.gitService.pull();
            
            for (const uri of uris) {
                const resolvedPath = resolveVSCodeVariables(uri.fsPath);
                log.debug('Processing changed file:', resolvedPath);
                
                const targetPath = path.join(
                    this.gitService.gitDirectory,
                    pattern.remoteDir,
                    path.relative(pattern.baseDir, resolvedPath)
                );
                
                await copyFile(resolvedPath, targetPath);
            }
            
            await this.gitService.push();
            log.info('Changes synchronized successfully');
        } catch (error) {
            log.error('Error processing file changes:', error);
            throw error;
        }
    }

    private async withSyncLock<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
        if (!this.enabled) {
            log.warn('Sync is disabled');
            return Promise.reject(new Error('Sync is disabled'));
        }

        if (!this.gitService.isInitialized) {
            const error = 'Git service not initialized';
            log.error(error);
            throw new Error(error);
        }

        try {
            return await operation();
        } catch (error) {
            const errorMessage = `${operationName} failed: ${error instanceof Error ? error.message : String(error)}`;
            log.error(`Error during ${operationName}:`, errorMessage);
            vscode.window.showErrorMessage(errorMessage);
            throw new Error(errorMessage);
        }
    }
    private async copyFilesToRepository(){
        for (const entry of getConfiguration().getFilePatterns()) {
            const files = await getFiles(entry, entry.baseDir);
            for (const file of files) {
                log.debug('Copying file to repository:', file);
                await copyFile(file, path.join(entry.remoteDir, path.relative(entry.baseDir, file)));
            }
        }
    }
    private async copyFilesFromRepository(){
        for (const entry of getConfiguration().getFilePatterns()) {
            const files = await getFiles(entry, entry.remoteDir);
            for (const file of files) {
                log.debug('Copying file from repository:', file);
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
                log.info('Local changes detected, preparing to push');
                await this.pushChanges();
            } else {
                log.info('No local changes, pulling from remote');
                await this.pullChanges();
            }

            log.info('Sync completed successfully');
        }, 'sync');
    }

    async forcePush(): Promise<void> {
        await this.withSyncLock(async () => {
            log.warn('Force pushing changes');
            await this.copyFilesToRepository();
            await pushExtensions(this.extensionsFile);
            await this.gitService.forcePush();
            log.info('Force push completed successfully');
        }, 'force push');
    }

    async forcePull(): Promise<void> {
        await this.withSyncLock(async () => {
            log.warn('Force pulling changes');
            await this.gitService.forcePull();
            await pullExtensions(this.extensionsFile);
            await this.copyFilesFromRepository();
            log.info('Force pull completed successfully');
        }, 'force pull');
    }

    public dispose(): void {
        log.info('Disposing sync service');
        this.teardownWatchers();
        log.info('Sync service disposed');
    }

    private async setupExtensionWatcher() {
        if (!getConfiguration().shouldSyncExtensions()) {
            log.debug('Extension sync is disabled');
            return;
        }

        log.debug('Setting up extension watcher');
        this.extensionWatcherListener = vscode.extensions.onDidChange(async () => {
            try {
                log.info('Extensions changed, updating sync file');
                await pushExtensions(this.extensionsFile);
                await this.gitService.push();
                log.info('Extensions synchronized successfully');
            } catch (error) {
                log.error('Error syncing extensions:', error);
            }
        });
    }
} 