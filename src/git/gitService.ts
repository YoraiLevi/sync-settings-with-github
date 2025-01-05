import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import simpleGit, { SimpleGit } from 'simple-git';
import { getConfiguration } from '../utils/configuration';

export class GitService {
    private workingDir: string;
    private git: SimpleGit | undefined;
    private _initialized: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        this.workingDir = path.join(context.globalStorageUri.fsPath, 'settings-sync');
        console.log('[GitService] GitService initialized with working directory:', this.workingDir);
    }

    async initialize(): Promise<void> {
        const repoUrl = getConfiguration().getRepositoryUrl();
        if (!repoUrl) {
            throw new Error('Repository URL not configured');
        }

        // Ensure working directory exists
        if (!fs.existsSync(this.workingDir)) {
            console.log('Creating working directory');
            fs.mkdirSync(this.workingDir, { recursive: true });
        }

        try {
            const isRepo = fs.existsSync(path.join(this.workingDir, '.git'));
            const branch = getConfiguration().getRepositoryBranch();
            if (!isRepo) {
                // Initialize new repository
                console.log('Initializing new repository');
                this.git = simpleGit(this.workingDir);
                await this.git.init();
                await this.git.addRemote('origin', repoUrl);
            } else {
                // Set up git in the working directory
                console.log('Setting up git in existing repository');
                this.git = simpleGit(this.workingDir);
            }
            await this.git.checkout(branch);
            this._initialized = true;
        } catch (error) {
            console.error('Failed to initialize git:', error);
            throw error;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (!this._initialized) {
            await this.initialize();
        }
    }

    private async getGit(): Promise<SimpleGit> {
        await this.ensureInitialized();
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        return this.git;
    }

    async pull(): Promise<void> {
        const git = await this.getGit();
        try {
            await git.pull(['--rebase']);
        } catch (error) {
            console.error('Failed to pull changes:', error);
            throw error;
        }
    }

    async push(): Promise<void> {
        const git = await this.getGit();
        try {
            if (getConfiguration().getPullBeforePush()) {
                await git.status();
                await this.pull();
                await git.stash(['pop']);
            }
            const status = await git.status();
            if (!status.isClean()) {
                await git.add('.');
                await git.commit('Update settings');
                try {
                    await git.push();
                } catch (error) {
                    console.error('Failed to push changes:', error);
                    // Try to undo the commit
                    try {
                        await git.reset(['--hard', 'HEAD~1']);
                    } catch (undoError) {
                        console.error('Failed to undo commit after failed push:', undoError);
                    }
                    throw error;
                }
            }
        } catch (error) {
            console.error('Failed to push changes:', error);
            throw error;
        }
    }

    async forcePush(): Promise<void> {
        const git = await this.getGit();
        try {
            if (getConfiguration().getPullBeforeForcePush()) {
                await git.status();
                await this.pull();
                await git.stash(['pop']);
            }
            const status = await git.status();
            if (!status.isClean()) {
                await git.add('.');
                await git.commit('Force update settings');
                await git.push(['-f']);
            }
        } catch (error) {
            console.error('Failed to force push changes:', error);
            throw error;
        }
    }

    async forcePull(): Promise<void> {
        const git = await this.getGit();
        try {
            await git.fetch('origin');
            const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
            await git.reset(['--hard', `origin/${branch}`]);
        } catch (error) {
            console.error('Failed to force pull changes:', error);
            throw error;
        }
    }

    async hasChanges(): Promise<boolean> {
        const git = await this.getGit();
        try {
            const status = await git.status();
            return !status.isClean();
        } catch (error) {
            console.error('Failed to check for changes:', error);
            throw error;
        }
    }

    async reinitialize(): Promise<void> {
        try {
            // Delete the existing repository if it exists
            if (fs.existsSync(this.workingDir)) {
                console.log('Removing existing repository');
                await fs.promises.rm(this.workingDir, { recursive: true, force: true });
            }

            // Reset initialized state
            this._initialized = false;
            this.git = undefined;

            // Initialize again
            await this.initialize();
        } catch (error) {
            console.error('Failed to reinitialize repository:', error);
            throw error;
        }
    }

    getWorkingDirectory(): string {
        return this.workingDir;
    }

    isInitialized(): boolean {
        return this._initialized;
    }
} 