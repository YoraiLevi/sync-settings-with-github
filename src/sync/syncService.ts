import * as vscode from 'vscode';
import { GitService } from '../git/gitService';
import { ExtensionService } from './extensionService';
import { FileManager } from '../files/fileManager';
import { WatcherService } from '../files/watcherService';
import { Configuration } from '../config/configuration';

function log(message: string, ...args: any[]) {
    console.log(`[SyncService] ${message}`, ...args);
}

export class SyncService {
    private syncTimer: NodeJS.Timeout | undefined;
    private isEnabled: boolean = false;
    private fileManager: FileManager;
    private watcherService: WatcherService;
    
    constructor(
        private context: vscode.ExtensionContext,
        private gitService: GitService,
        private extensionService: ExtensionService
    ) {
        log('SyncService initialized');
        this.fileManager = new FileManager(this.gitService.getWorkingDirectory());
        this.watcherService = new WatcherService(
            this.fileManager, 
            this.handleFileChange.bind(this)
        );
    }

    public get enabled(): boolean {
        return this.isEnabled;
    }

    public toggleEnabled = () => {
        if (!this.isEnabled) {
            this.enable();
        } else {
            this.disable();
        }
    };

    async initialize(): Promise<void> {
        log('Initializing sync service');
        await this.gitService.initialize();
        
        if (Configuration.shouldPullOnLaunch()) {
            try {
                log('Performing initial pull of settings');
                await this.gitService.pull();
                
                const hasRemoteChanges = await this.gitService.hasChanges();
                if (hasRemoteChanges) {
                    log('Remote changes detected, copying to settings directory');
                    await this.fileManager.copyFilesFromWorkingDir();
                    log('Pulling extensions from sync file');
                    await this.extensionService.pullExtensions();
                } else {
                    log('No remote changes to apply during initialization');
                }
            } catch (error) {
                log('Error during initial pull:', error);
            }
        }

        await this.watcherService.setupFileWatcher();
        await this.setupPeriodicSync();
        await this.setupExtensionWatcher();
        this.isEnabled = true;
        log('Sync service initialized successfully');
    }

    private async setupPeriodicSync(): Promise<void> {
        log('Setting up periodic sync');
        const interval = Configuration.getSyncInterval();
        log('Sync interval:', interval);

        if (this.syncTimer) {
            log('Clearing existing sync timer');
            clearTimeout(this.syncTimer);
        }

        this.syncTimer = setTimeout(async () => {
            if (this.isEnabled) {
                log('Running periodic sync');
                await this.sync();
                // Setup next sync after current one completes
                await this.setupPeriodicSync();
            }
        }, interval);
        log('Periodic sync setup complete');
    }

    private async handleFileChange(): Promise<void> {
        try {
            await this.fileManager.copyFilesToWorkingDir();
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
        if (!this.isEnabled) {
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
        await this.fileManager.copyFilesToWorkingDir();
        await this.extensionService.pushExtensions();
        await this.gitService.push();
    }

    private async pullChanges(): Promise<void> {
        await this.gitService.pull();
        const hasRemoteChanges = await this.gitService.hasChanges();
        if (hasRemoteChanges) {
            await this.fileManager.copyFilesFromWorkingDir();
            await this.extensionService.pullExtensions();
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
            await this.fileManager.copyFilesToWorkingDir();
            await this.extensionService.pushExtensions();
            await this.gitService.forcePush();
            log('Force push completed successfully');
        }, 'force push');
    }

    async forcePull(): Promise<void> {
        await this.withSyncLock(async () => {
            await this.gitService.forcePull();
            await this.fileManager.copyFilesFromWorkingDir();
            await this.extensionService.pullExtensions();
            log('Force pull completed successfully');
        }, 'force pull');
    }

    enable(): void {
        log('Enabling sync service');
        this.isEnabled = true;
        this.setupPeriodicSync().catch(error => {
            log('Error setting up periodic sync:', error);
            console.error('Failed to setup periodic sync:', error);
        });
    }

    disable(): void {
        log('Disabling sync service');
        this.isEnabled = false;
    }

    dispose(): void {
        log('Disposing sync service');
        this.isEnabled = false;
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }
        this.watcherService.dispose();
        log('Sync service disposed');
    }

    private async setupExtensionWatcher(): Promise<void> {
        log('Setting up extension watcher');
        
        const extensionWatcher = vscode.extensions.onDidChange(async () => {
            log('Extension change detected');
            if (!this.isEnabled || !Configuration.shouldSyncExtensions()) {
                return;
            }

            try {
                log('Extension change detected, pushing to sync file');
                await this.extensionService.pushExtensions();
                
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