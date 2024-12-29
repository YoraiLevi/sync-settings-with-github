import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitService } from '../git/gitService';
import { ExtensionService } from './extensionService';
import fg from 'fast-glob';

function log(message: string, ...args: any[]) {
    console.log(`[SyncService] ${message}`, ...args);
}

export class SyncService {
    private disposables: vscode.Disposable[] = [];
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private syncTimer: NodeJS.Timeout | undefined;
    private debounceTimer: NodeJS.Timeout | undefined;
    private isEnabled: boolean = false;
    private isSyncing: boolean = false;
    private isApplyingRemoteChanges: boolean = false;
    private watchedFiles: Map<string, fs.FSWatcher> = new Map();
    private extensionService: ExtensionService;
    
    constructor(
        private context: vscode.ExtensionContext,
        private gitService: GitService
    ) {
        log('SyncService initialized');
        this.extensionService = new ExtensionService(this.gitService.getWorkingDirectory());
        
        // Watch for configuration changes
        const configWatcher = vscode.workspace.onDidChangeConfiguration(async e => {
            if (e.affectsConfiguration('settingsSync.files')) {
                log('Settings sync configuration changed, updating file watchers');
                // Clean up existing watchers
                for (const watcher of this.watchedFiles.values()) {
                    watcher.close();
                }
                this.watchedFiles.clear();
                
                try {
                    // First copy any new files to the working directory
                    log('Copying files after configuration change');
                    await this.copyFilesToWorkingDir();
                    
                    // Setup watchers for all files (including new ones)
                    await this.setupFileWatcher();
                    
                    // If we have changes, push them
                    if (await this.gitService.hasChanges()) {
                        log('New files detected, pushing changes');
                        await this.gitService.push();
                    } else {
                        log('No changes to push after configuration update');
                    }
                } catch (error) {
                    log('Error handling configuration change:', error);
                    vscode.window.showErrorMessage(`Failed to handle configuration change: ${error}`);
                }
            }
        });
        this.disposables.push(configWatcher);
    }

    public toggleEnabled = () => {
        this.isEnabled = !this.isEnabled;
        if (this.isEnabled) {
            this.enable();
        } else {
            this.disable();
        }
    };

    async initialize(): Promise<void> {
        log('Initializing sync service');
        await this.gitService.initialize();
        
        // Check if we should pull on launch
        const config = vscode.workspace.getConfiguration('settingsSync');
        const shouldPullOnLaunch = config.get<boolean>('pullOnLaunch', true);
        
        if (shouldPullOnLaunch) {
            // Do an initial pull to get latest settings
            try {
                log('Performing initial pull of settings');
                await this.gitService.pull();
                
                // Check if pull brought any changes
                const hasRemoteChanges = await this.gitService.hasChanges();
                if (hasRemoteChanges) {
                    log('Remote changes detected, copying to settings directory');
                    await this.copyFilesFromWorkingDir();
                    // Pull and sync extensions
                    log('Pulling extensions from sync file');
                    await this.extensionService.pullExtensions();
                } else {
                    log('No remote changes to apply during initialization');
                }
            } catch (error) {
                log('Error during initial pull:', error);
                // Don't throw error, continue with initialization
            }
        } else {
            log('Skipping initial pull (disabled by configuration)');
        }

        await this.setupFileWatcher();
        await this.setupPeriodicSync();
        await this.setupExtensionWatcher();
        this.isEnabled = true;
        log('Sync service initialized successfully');
    }

    private async setupFileWatcher(): Promise<void> {
        log('Setting up file watcher');
        const userSettingsPath = this.getUserSettingsPath();
        log('User settings path:', userSettingsPath);

        // Get file patterns from configuration
        const config = vscode.workspace.getConfiguration('settingsSync');
        const fileConfig = config.get<{
            patterns: string[];
            excludePatterns: string[];
            externalFiles: Array<{ source: string; target: string; }>;
        }>('files');

        if (!fileConfig) {
            log('No file configuration found');
            return;
        }

        log('File configuration:', fileConfig);

        // Track last event time to prevent duplicates
        const lastEventTime = new Map<string, number>();
        const EVENT_THRESHOLD = 100; // ms

        const handleFileEvent = (uri: vscode.Uri) => {
            const now = Date.now();
            const lastTime = lastEventTime.get(uri.fsPath) || 0;
            
            // If the last event for this file was too recent, skip
            if (now - lastTime < EVENT_THRESHOLD) {
                log(`Skipping duplicate event for ${uri.fsPath} (too soon after last event)`);
                return;
            }
            
            lastEventTime.set(uri.fsPath, now);
            log(`File event for: ${uri.fsPath}`);
            this.handleFileChange(uri);
        };

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
                watcher.onDidChange(handleFileEvent);
                watcher.onDidCreate(handleFileEvent);
                watcher.onDidDelete(handleFileEvent);

                this.disposables.push(watcher);
                log(`Watcher created successfully for pattern: ${pattern}`);
            } catch (error) {
                log(`Error setting up watcher for pattern ${pattern}:`, error);
            }
        }

        // Create watchers for external files
        for (const externalFile of fileConfig.externalFiles) {
            const sourcePath = externalFile.source.startsWith('~')
                ? path.join(process.env.HOME || '', externalFile.source.slice(1))
                : externalFile.source;

            log(`Setting up watcher for external file: ${sourcePath}`);
            try {
                // Create parent directory if it doesn't exist (for new files)
                const parentDir = path.dirname(sourcePath);
                if (!fs.existsSync(parentDir)) {
                    fs.mkdirSync(parentDir, { recursive: true });
                }

                // Clean up existing watcher if any
                const existingWatcher = this.watchedFiles.get(sourcePath);
                if (existingWatcher) {
                    existingWatcher.close();
                    this.watchedFiles.delete(sourcePath);
                }

                // Watch both the file and its parent directory
                const watcher = fs.watch(path.dirname(sourcePath), (eventType, filename) => {
                    if (filename && path.basename(sourcePath) === filename) {
                        const now = Date.now();
                        const lastTime = lastEventTime.get(sourcePath) || 0;
                        
                        // If the last event for this file was too recent, skip
                        if (now - lastTime < EVENT_THRESHOLD) {
                            log(`Skipping duplicate native event for ${sourcePath} (too soon after last event)`);
                            return;
                        }
                        
                        lastEventTime.set(sourcePath, now);
                        log(`Native watcher detected change: ${eventType} - ${filename}`);
                        this.handleFileChange(vscode.Uri.file(sourcePath));
                    }
                });

                // Also try to watch the file directly if it exists
                if (fs.existsSync(sourcePath)) {
                    const fileWatcher = fs.watch(sourcePath, (eventType) => {
                        const now = Date.now();
                        const lastTime = lastEventTime.get(sourcePath) || 0;
                        
                        // If the last event for this file was too recent, skip
                        if (now - lastTime < EVENT_THRESHOLD) {
                            log(`Skipping duplicate direct file event for ${sourcePath} (too soon after last event)`);
                            return;
                        }
                        
                        lastEventTime.set(sourcePath, now);
                        log(`Native watcher detected direct file change: ${eventType}`);
                        this.handleFileChange(vscode.Uri.file(sourcePath));
                    });
                    
                    // Combine both watchers into one disposable
                    this.watchedFiles.set(sourcePath, watcher);
                    this.watchedFiles.set(`${sourcePath}-direct`, fileWatcher);
                    
                    this.disposables.push(new vscode.Disposable(() => {
                        watcher.close();
                        fileWatcher.close();
                        this.watchedFiles.delete(sourcePath);
                        this.watchedFiles.delete(`${sourcePath}-direct`);
                    }));
                } else {
                    this.watchedFiles.set(sourcePath, watcher);
                    this.disposables.push(new vscode.Disposable(() => {
                        watcher.close();
                        this.watchedFiles.delete(sourcePath);
                    }));
                }

                log(`Watchers created successfully for ${sourcePath}`);
            } catch (error) {
                log(`Error setting up watcher for external file ${sourcePath}:`, error);
            }
        }

        log('File watcher setup complete');
    }

    private async setupPeriodicSync(): Promise<void> {
        log('Setting up periodic sync');
        const config = vscode.workspace.getConfiguration('settingsSync');
        const interval = config.get<number>('syncInterval', 300) * 1000; // Convert to milliseconds
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

    private async handleFileChange(uri: vscode.Uri): Promise<void> {
        log('File change detected:', uri.fsPath);
        if (!this.isEnabled || this.isSyncing || this.isApplyingRemoteChanges) {
            log(this.isSyncing ? 'Sync in progress, ignoring file change' : 
                this.isApplyingRemoteChanges ? 'Applying remote changes, ignoring file change' :
                'Sync is disabled, ignoring file change');
            return;
        }

        const config = vscode.workspace.getConfiguration('settingsSync');
        const debounceDelay = config.get<number>('debounceDelay', 5) * 1000; // Convert to milliseconds
        log('Debounce delay:', debounceDelay);

        if (this.debounceTimer) {
            log('Clearing existing debounce timer');
            clearTimeout(this.debounceTimer);
        }

        return new Promise<void>((resolve, reject) => {
            log('Setting up new debounce timer');
            this.debounceTimer = setTimeout(async () => {
                log('Debounce timer expired, copying and syncing changes');
                try {
                    // First copy the files to the working directory
                    await this.copyFilesToWorkingDir();
                    
                    // Then check if we have changes and sync
                    if (await this.gitService.hasChanges()) {
                        log('Changes detected, syncing');
                        await this.sync();
                        log('Sync completed after file change');
                    } else {
                        log('No changes detected after copying files');
                    }
                    resolve();
                } catch (error) {
                    log('Error during sync after file change:', error);
                    reject(error);
                }
            }, debounceDelay);
        });
    }

    private getUserSettingsPath(): string {
        // Get the product name (Code or Cursor)
        const productName = vscode.env.appName === 'Cursor' ? 'Cursor' : 'Code';
        
        // Get the actual user settings directory based on platform and product
        const userSettingsPath = process.platform === 'win32'
            ? path.join(process.env.APPDATA || '', productName, 'User')
            : process.platform === 'darwin'
                ? path.join(process.env.HOME || '', 'Library', 'Application Support', productName, 'User')
                : path.join(process.env.HOME || '', '.config', productName, 'User');

        // Ensure the directory exists
        if (!fs.existsSync(userSettingsPath)) {
            log('Creating user settings directory');
            fs.mkdirSync(userSettingsPath, { recursive: true });
        }

        log('User settings path:', userSettingsPath);
        return userSettingsPath;
    }

    private async copyFilesToWorkingDir(): Promise<void> {
        log('Copying files to working directory');
        const workingDir = this.gitService.getWorkingDirectory();
        const userSettingsPath = this.getUserSettingsPath();

        log('Paths:', { workingDir, userSettingsPath });

        // Get file patterns from configuration
        const config = vscode.workspace.getConfiguration('settingsSync');
        const fileConfig = config.get<{
            patterns: string[];
            excludePatterns: string[];
            externalFiles: Array<{ source: string; target: string; }>;
        }>('files', {
            patterns: ['settings.json', 'keybindings.json'],
            excludePatterns: [],
            externalFiles: []
        });

        // Find all files to sync using glob patterns
        const files = await fg(fileConfig.patterns, {
            ignore: fileConfig.excludePatterns,
            dot: true,
            absolute: true,
            cwd: userSettingsPath
        });

        log('Found files to sync:', files);

        // Copy each file from settings directory
        for (const file of files) {
            const relativePath = path.relative(userSettingsPath, file);
            const targetPath = path.join(workingDir, relativePath);
            log('Copying file:', { source: file, target: targetPath });
            await this.copyFile(file, targetPath);
        }

        // Handle external files
        for (const externalFile of fileConfig.externalFiles) {
            const sourcePath = externalFile.source.startsWith('~') 
                ? path.join(process.env.HOME || '', externalFile.source.slice(1))
                : externalFile.source;
            const targetPath = path.join(workingDir, externalFile.target);

            log('Copying external file:', { source: sourcePath, target: targetPath });
            await this.copyFile(sourcePath, targetPath);
        }

        log('File copying complete');
    }

    private async copyFile(source: string, target: string): Promise<void> {
        try {
            log('Copying file:', { source, target });
            if (fs.existsSync(source)) {
                await fs.promises.mkdir(path.dirname(target), { recursive: true });
                await fs.promises.copyFile(source, target);
                log('File copied successfully');
            } else {
                // For external files, just log that they don't exist
                if (source.includes('~') || path.isAbsolute(source)) {
                    log('Optional external file not found:', source);
                } else {
                    // For VS Code settings files, we should still warn
                    log('Source file does not exist:', source);
                }
            }
        } catch (error) {
            const errorMessage = `Failed to copy file ${source} to ${target}: ${error instanceof Error ? error.message : String(error)}`;
            log('Error copying file:', errorMessage);
            throw new Error(errorMessage);
        }
    }

    private async copyFilesFromWorkingDir(): Promise<void> {
        this.isApplyingRemoteChanges = true;
        try {
            log('Copying files from working directory to VS Code settings');
            const workingDir = this.gitService.getWorkingDirectory();
            const userSettingsPath = this.getUserSettingsPath();

            log('Paths:', { workingDir, userSettingsPath });

            // Get file patterns from configuration
            const config = vscode.workspace.getConfiguration('settingsSync');
            const fileConfig = config.get<{
                patterns: string[];
                excludePatterns: string[];
                externalFiles: Array<{ source: string; target: string; }>;
            }>('files', {
                patterns: ['settings.json', 'keybindings.json'],
                excludePatterns: [],
                externalFiles: []
            });

            // Find all files to sync using glob patterns
            const files = await fg(fileConfig.patterns, {
                ignore: fileConfig.excludePatterns,
                dot: true,
                absolute: true,
                cwd: workingDir
            });

            log('Found files to sync:', files);

            // Copy each file from settings directory
            for (const file of files) {
                const relativePath = path.relative(workingDir, file);
                const targetPath = path.join(userSettingsPath, relativePath);
                log('Copying file:', { source: file, target: targetPath });
                await this.copyFile(file, targetPath);
            }

            // Handle external files
            for (const externalFile of fileConfig.externalFiles) {
                const targetPath = externalFile.source.startsWith('~')
                    ? path.join(process.env.HOME || '', externalFile.source.slice(1))
                    : externalFile.source;
                const sourcePath = path.join(workingDir, externalFile.target);

                log('Copying external file:', { source: sourcePath, target: targetPath });
                await this.copyFile(sourcePath, targetPath);
            }

            log('File copying complete');
        } finally {
            // Ensure the flag is reset even if an error occurs
            setTimeout(() => {
                this.isApplyingRemoteChanges = false;
                log('Released remote changes lock');
            }, 1000); // Small delay to ensure file events are processed
        }
    }

    async sync(): Promise<void> {
        log('Starting sync operation');
        if (!this.isEnabled) {
            const error = 'Sync is disabled';
            log(error);
            return;
        }

        if (this.isSyncing) {
            log('Sync already in progress, skipping');
            return;
        }

        if (!this.gitService.isInitialized()) {
            const error = 'Git service not initialized';
            log('Error:', error);
            throw new Error(error);
        }

        try {
            this.isSyncing = true;
            log('Setting sync lock');

            // Check for changes before doing anything
            const hasLocalChanges = await this.gitService.hasChanges();
            
            if (hasLocalChanges) {
                // If we have local changes, copy files and push
                log('Local changes detected, preparing to push');
                await this.copyFilesToWorkingDir();
                // Push current extensions to sync file
                log('Pushing extensions to sync file');
                await this.extensionService.pushExtensions();
                log('Pushing changes to remote');
                await this.gitService.push();
            } else {
                // If no local changes, try to pull and check for remote changes
                log('No local changes, pulling from remote');
                await this.gitService.pull();
                
                // Check if pull brought any changes
                const hasRemoteChanges = await this.gitService.hasChanges();
                if (hasRemoteChanges) {
                    log('Remote changes detected, copying to settings directory');
                    // Only copy files from working directory if we got changes from remote
                    await this.copyFilesFromWorkingDir();
                    // Pull and sync extensions after getting remote changes
                    log('Pulling extensions from sync file');
                    await this.extensionService.pullExtensions();
                } else {
                    log('No remote changes to apply');
                }
            }
            
            log('Sync completed successfully');
        } catch (error) {
            log('Error during sync:', error);
            throw error;
        } finally {
            // Use setTimeout to ensure all file operations are complete before releasing lock
            setTimeout(() => {
                this.isSyncing = false;
                log('Released sync lock');
            }, 1000); // 1 second delay
        }
    }

    async forcePush(): Promise<void> {
        log('Starting force push operation');
        try {
            await this.copyFilesToWorkingDir();
            // Push current extensions to sync file
            await this.extensionService.pushExtensions();
            await this.gitService.forcePush();
            log('Force push completed successfully');
        } catch (error) {
            const errorMessage = `Force push failed: ${error instanceof Error ? error.message : String(error)}`;
            log('Error during force push:', errorMessage);
            vscode.window.showErrorMessage(errorMessage);
            throw new Error(errorMessage);
        }
    }

    async forcePull(): Promise<void> {
        log('Starting force pull operation');
        try {
            await this.gitService.forcePull();
            await this.copyFilesFromWorkingDir();
            // Pull and sync extensions from remote
            log('Pulling extensions from sync file');
            await this.extensionService.pullExtensions();
            log('Force pull completed successfully');
        } catch (error) {
            const errorMessage = `Force pull failed: ${error instanceof Error ? error.message : String(error)}`;
            log('Error during force pull:', errorMessage);
            vscode.window.showErrorMessage(errorMessage);
            throw new Error(errorMessage);
        }
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
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        // Clean up native watchers
        for (const watcher of this.watchedFiles.values()) {
            watcher.close();
        }
        this.watchedFiles.clear();
        this.disposables.forEach(d => d.dispose());
        log('Sync service disposed');
    }

    private async setupExtensionWatcher(): Promise<void> {
        log('Setting up extension watcher');
        
        // Watch for extension changes
        const extensionWatcher = vscode.extensions.onDidChange(async () => {
            log('Extension change detected');
            if (!this.isEnabled || this.isSyncing || this.isApplyingRemoteChanges) {
                log(this.isSyncing ? 'Sync in progress, ignoring extension change' : 
                    this.isApplyingRemoteChanges ? 'Applying remote changes, ignoring extension change' :
                    'Sync is disabled, ignoring extension change');
                return;
            }

            try {
                // Push current extensions to sync file
                log('Extension change detected, pushing to sync file');
                await this.extensionService.pushExtensions();
                
                // Push changes to remote
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

        this.disposables.push(extensionWatcher);
        log('Extension watcher setup complete');
    }
} 