import * as vscode from 'vscode';
import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs';

function log(message: string, ...args: any[]) {
    console.log(`[GitService] ${message}`, ...args);
}

export class GitService {
    private git: SimpleGit;
    private workingDirectory: string;
    private initialized: boolean = false;

    constructor(private context: vscode.ExtensionContext) {
        this.workingDirectory = path.join(context.globalStorageUri.fsPath, 'settings-sync');
        this.git = simpleGit();
        log('GitService initialized with working directory:', this.workingDirectory);
    }

    async initialize(): Promise<void> {
        log('Initializing git service');
        const config = vscode.workspace.getConfiguration('settingsSync.git');
        const repoUrl = config.get<string>('repositoryUrl');
        const branch = config.get<string>('branch') || 'main';

        log('Configuration:', { repoUrl, branch });

        if (!repoUrl) {
            const error = 'Git repository URL is not configured';
            log('Error:', error);
            throw new Error(error);
        }

        // Ensure working directory exists
        if (!fs.existsSync(this.workingDirectory)) {
            log('Creating working directory');
            fs.mkdirSync(this.workingDirectory, { recursive: true });
        }

        try {
            const isRepo = fs.existsSync(path.join(this.workingDirectory, '.git'));
            
            if (!isRepo) {
                // Initialize new repository
                log('Initializing new repository');
                this.git = simpleGit(this.workingDirectory);
                await this.git.init();
                await this.git.addRemote('origin', repoUrl);
            } else {
                // Set up git in the working directory
                log('Setting up git in existing repository');
                this.git = simpleGit(this.workingDirectory);
            }

            // Fetch from remote
            log('Fetching from remote');
            await this.git.fetch('origin');

            try {
                // Try to checkout the branch
                log('Checking out branch:', branch);
                await this.git.checkout(branch);
            } catch (error) {
                // If branch doesn't exist, create it
                log('Branch not found, creating new branch:', branch);
                await this.git.checkoutLocalBranch(branch);
                
                // Try to pull from origin if the branch exists remotely
                try {
                    log('Attempting to pull from origin');
                    await this.git.pull('origin', branch);
                } catch (pullError) {
                    // If pull fails, it might be a new branch
                    log('Pull failed, might be a new branch:', pullError);
                }
            }
            
            this.initialized = true;
            log('Git service initialized successfully');
        } catch (error) {
            const errorMessage = `Failed to initialize git: ${error instanceof Error ? error.message : String(error)}`;
            log('Error during initialization:', errorMessage);
            throw new Error(errorMessage);
        }
    }

    async pull(): Promise<void> {
        log('Pulling changes');
        if (!this.initialized) {
            throw new Error('Git service not initialized');
        }

        try {
            // Set merge strategy to avoid divergent branches error
            await this.git.pull(['--rebase']);
            log('Pull completed successfully');
        } catch (error) {
            const errorMessage = `Failed to pull changes: ${error instanceof Error ? error.message : String(error)}`;
            log('Error during pull:', errorMessage);
            throw new Error(errorMessage);
        }
    }

    async push(): Promise<void> {
        log('Pushing changes');
        if (!this.isInitialized()) {
            throw new Error('Git service not initialized');
        }

        try {
            const config = vscode.workspace.getConfiguration('settingsSync.git');
            const shouldPullFirst = config.get<boolean>('pullBeforePush', true);
            const branch = config.get<string>('branch') || 'main';
            const repoUrl = config.get<string>('repositoryUrl') || '';

            if (shouldPullFirst) {
                // Pull latest changes before committing
                log('Pulling latest changes before push');
                await this.git.pull(['--rebase']);
            }
            
            // Stage all changes
            await this.git.add('.');
            
            // Commit our changes
            await this.git.commit('Update settings');
            
            try {
                // Push the changes
                await this.git.push();
                log('Push successful');
            } catch (pushError) {
                // Log the full error for debugging
                log('Push failed with error:', pushError);

                // Reset hard to before our commit
                log('Resetting to before our commit');
                await this.git.reset(['--hard', 'HEAD~1']);

                // Show a simplified error message to the user
                const choice = await vscode.window.showErrorMessage(
                    `Failed to push to ${repoUrl} (${branch})`,
                    'Pull and Retry',
                    'Cancel'
                );

                if (choice === 'Pull and Retry') {
                    log('User chose to pull and retry');
                    try {
                        // Pull latest changes
                        await this.git.pull(['--rebase']);
                        
                        // Re-add our changes and commit
                        await this.git.add('.');
                        await this.git.commit('Update settings');
                        
                        // Try push again
                        await this.git.push();
                        log('Push successful after pull and retry');
                    } catch (retryError) {
                        log('Error during retry:', retryError);
                        // Create a clickable link to the repository
                        const message = `Failed to push changes automatically. Please resolve conflicts manually in the repository.`;
                        
                        vscode.window.showErrorMessage(message, 'Open Repository').then(selection => {
                            if (selection === 'Open Repository') {
                                vscode.commands.executeCommand('sync-settings-with-github.openRepository');
                            }
                        });
                        
                        throw new Error(`Failed to reconcile changes. Repository location: ${this.workingDirectory}`);
                    }
                } else {
                    throw new Error(`Push failed to ${repoUrl} (${branch})`);
                }
            }
        } catch (error) {
            const errorMessage = `Failed to push changes: ${error instanceof Error ? error.message : String(error)}`;
            log('Error:', errorMessage);
            vscode.window.showErrorMessage(errorMessage);
            throw new Error(errorMessage);
        }
    }

    async forcePush(): Promise<void> {
        log('Force pushing changes');
        if (!this.isInitialized()) {
            throw new Error('Git service not initialized');
        }

        try {
            const config = vscode.workspace.getConfiguration('settingsSync.git');
            const shouldPullFirst = config.get<boolean>('pullBeforeForcePush', false);

            if (shouldPullFirst) {
                // Pull latest changes before force pushing
                log('Pulling latest changes before force push');
                await this.git.pull();
            }

            // Stage and commit changes
            await this.git.add('.');
            await this.git.commit('Force update settings');
            
            // Force push (will overwrite remote changes)
            await this.git.push(['-f']);
            log('Force push successful');
        } catch (error) {
            const errorMessage = `Failed to force push changes: ${error instanceof Error ? error.message : String(error)}`;
            log('Error:', errorMessage);
            vscode.window.showErrorMessage(errorMessage);
            throw new Error(errorMessage);
        }
    }

    async forcePull(): Promise<void> {
        log('Force pulling changes');
        if (!this.initialized) {
            const error = 'Git service not initialized';
            log('Error:', error);
            throw new Error(error);
        }

        try {
            await this.git.fetch('origin');
            const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
            await this.git.reset(['--hard', `origin/${branch}`]);
            log('Force pull completed successfully');
        } catch (error) {
            const errorMessage = `Failed to force pull changes: ${error instanceof Error ? error.message : String(error)}`;
            log('Error during force pull:', errorMessage);
            throw new Error(errorMessage);
        }
    }

    async hasChanges(): Promise<boolean> {
        log('Checking for changes');
        if (!this.initialized) {
            log('Git service not initialized, returning false');
            return false;
        }

        const status = await this.git.status();
        const hasChanges = status.modified.length > 0 || 
                         status.not_added.length > 0 || 
                         status.deleted.length > 0;
        log('Changes detected:', { hasChanges, status });
        return hasChanges;
    }

    getWorkingDirectory(): string {
        return this.workingDirectory;
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    async openRepository(): Promise<void> {
        if (!this.initialized) {
            throw new Error('Git service not initialized');
        }

        const repoUri = vscode.Uri.file(this.workingDirectory);
        await vscode.commands.executeCommand('vscode.openFolder', repoUri, { forceNewWindow: true });
        log('Opened repository in new window');
    }

    async reinitialize(): Promise<void> {
        log('Reinitializing git service');
        
        try {
            // Delete the existing repository if it exists
            if (fs.existsSync(this.workingDirectory)) {
                log('Removing existing repository');
                await fs.promises.rm(this.workingDirectory, { recursive: true, force: true });
            }

            // Reset initialized state
            this.initialized = false;
            
            // Reinitialize from scratch
            await this.initialize();
            log('Repository reinitialized successfully');
        } catch (error) {
            const errorMessage = `Failed to reinitialize repository: ${error instanceof Error ? error.message : String(error)}`;
            log('Error during reinitialization:', errorMessage);
            vscode.window.showErrorMessage(errorMessage);
            throw new Error(errorMessage);
        }
    }
} 