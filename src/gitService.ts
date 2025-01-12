import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import simpleGit, { SimpleGit } from 'simple-git';
import { getConfiguration } from './utils/configuration';
import { createLogger, LogLevel } from './utils/logUtils';
import { IRepositoryService } from './IRepositoryService';

const log = createLogger({
    serviceName: 'GitService',
    minLevel: LogLevel.INFO
});


export const UPDATE_SETTINGS_COMMIT_MESSAGE = 'Update settings';
export const FORCE_UPDATE_SETTINGS_COMMIT_MESSAGE = 'Force update settings';
export const INITIAL_COMMIT_COMMIT_MESSAGE = 'Initial commit';
export class GitService implements IRepositoryService {
    private _gitDir: string;
    private _git: SimpleGit | undefined;
    private _initialized: boolean = false;

    public get gitDirectory(): string {
        return this._gitDir;
    }

    public get isInitialized(): boolean {
        return this._initialized;
    }
    private set isInitialized(value: boolean) {
        this._initialized = value;
    }

    constructor() {
        log.info('Initializing GitService');
        this._gitDir = getConfiguration().getRepositoryPath().fsPath;
        log.debug(`Set git directory to: ${this._gitDir}`);
    }

    private async initialize(): Promise<void> {
        log.info('GitService initializing with working directory:', this.gitDirectory);
        const repoUrl = getConfiguration().getRepositoryUrl();
        if (!repoUrl) {
            log.error('Repository URL not configured');
            throw new Error('Repository URL not configured');
        }
        // Ensure working directory exists
        try {
            log.debug('Starting git initialization...');
            const branch = getConfiguration().getRepositoryBranch();
            const git = this.git;
            log.debug(`Using branch: ${branch}`);
            await this.setupBranch(repoUrl, branch);
            this.isInitialized = true;
            log.info('Git initialization completed successfully');
        } catch (error: unknown) {
            if (error instanceof Error) {
                log.error('Failed to initialize git:', error.message);
            } else {
                log.error('Failed to initialize git:', error);
            }
            throw error;
        }
    }

    private async setupBranch(repoUrl: string, branch: string) {
        const git = this.git;
        const isRepo = fs.existsSync(path.join(this.gitDirectory, '.git'));
        log.debug(`Is existing git repo: ${isRepo}`);

        if (!isRepo) {
            log.info('No existing repository found, attempting to clone or create new');
            try {
                log.debug('Attempting to clone repository...');
                await git.clone(repoUrl, this.gitDirectory, ['--single-branch', '-b', branch]);
                log.info('Repository cloned successfully');
            } catch (error: unknown) {
                if (error instanceof Error) {
                    log.warn('Clone failed, initializing new repository', error.message);
                } else {
                    log.warn('Clone failed, initializing new repository', error);
                }
                await git.init(['-b', branch]);
                await git.addRemote('origin', repoUrl);
                log.info('New repository initialized');
            }
        }
        else if (isRepo) {
            log.debug('Existing repository found, configuring remote and branch');
            await git.removeRemote('origin').catch(() => {
                log.debug('No existing origin to remove');
            });
            await git.addRemote('origin', repoUrl);
            log.debug('Remote origin configured');

            try {
                log.debug('Attempting to checkout branch from remote');
                await git.checkout(['-b', branch, 'origin/' + branch]);
                log.debug('Remote branch checkout successful');
            }
            catch (error: unknown) {
                if (error instanceof Error) {
                    log.warn('Remote branch not found, attempting local checkout', error.message);
                } else {
                    log.warn('Remote branch not found, attempting local checkout', error);
                }
                try {
                    await git.checkout([branch]);
                    log.debug('Local branch checkout successful');
                }
                catch (error: unknown) {
                    if (error instanceof Error) {
                        log.warn('Branch does not exist, creating new orphan branch', error.message);
                    } else {
                        log.warn('Branch does not exist, creating new orphan branch', error);
                    }
                    await git.checkout(['--orphan', branch]);
                    log.info('New branch created');
                }
            }
        }
        try {
            log.debug('Checking for existing commits');
            await git.log();
            log.debug('Commits found');
        }
        catch (error: unknown) {
            if (error instanceof Error) {
                log.warn('No commits found, creating initial commit', error.message);
            } else {
                log.warn('No commits found, creating initial commit', error);
            }
            await git.commit(INITIAL_COMMIT_COMMIT_MESSAGE, ['--allow-empty']);
            log.info('Initial commit created and pushed');
        }
        // await git.pull(['--rebase', 'origin', branch]);
        await git.push(['-u', 'origin', branch]);
        // try {
        //     log('Setting upstream branch');
        //     await this.git.branch(['--set-upstream-to=origin/' + branch, branch]);
        //     log('Upstream branch set successfully');
        // }
        // catch (error) {
        //     log('Failed to set upstream to origin/' + branch, error);
        // }
    }

    public async ensureInitialized(): Promise<void> {
        log.debug('Ensuring git is initialized');
        if (!this.isInitialized) {
            log.info('Git not initialized, initializing now');
            await this.initialize();
        }
        log.trace('Git initialization check complete');
    }

    private get git(): SimpleGit {
        if (!this._git) {
            if (!fs.existsSync(this.gitDirectory)) {
                log.debug('Creating working directory as it does not exist');
                fs.mkdirSync(this.gitDirectory, { recursive: true });
            }
            log.trace('Creating git instance');
            this._git = simpleGit(this.gitDirectory);
        }
        return this._git;
    }

    async pull(): Promise<void> {
        const git = this.git;
        const repoUrl = getConfiguration().getRepositoryUrl();
        const branch = getConfiguration().getRepositoryBranch();
        await this.setupBranch(repoUrl, branch);
        try {
            log.debug('Pulling changes with rebase');
            await git.pull(['--rebase', 'origin', branch]);
            log.info('Pull completed successfully');
        } catch (error: unknown) {
            if (error instanceof Error) {
                log.error('Failed to pull changes:', error.message);
            } else {
                log.error('Failed to pull changes:', error);
            }
            throw error;
        }
    }

    async push(): Promise<void> {
        const git = this.git;
        const repoUrl = getConfiguration().getRepositoryUrl();
        const branch = getConfiguration().getRepositoryBranch();
        await this.setupBranch(repoUrl, branch);
        try {
            if (getConfiguration().getPullBeforePush()) {
                log.debug('Pull before push enabled, stashing changes');
                await git.stash();
                await this.pull();
                log.debug('Applying stashed changes');
                await git.stash(['pop']);
            }
            const status = await git.status();
            // if (!status.isClean()) {
            log.info('Changes detected, preparing to commit');
            await git.add('.');
            await git.commit(UPDATE_SETTINGS_COMMIT_MESSAGE);
            try {
                log.debug('Pushing changes to remote');
                await git.push(['-u', 'origin', branch]);
                log.info('Push completed successfully');
            } catch (error: unknown) {
                if (error instanceof Error) {
                    log.error('Failed to push changes:', error.message);
                } else {
                    log.error('Failed to push changes:', error);
                }
                // Try to undo the commit
                try {
                    log.warn('Attempting to undo failed commit');
                    await git.reset(['--hard', 'HEAD~1']);
                    log.info('Successfully undid commit');
                } catch (undoError: unknown) {
                    if (undoError instanceof Error) {
                        log.error('Failed to undo commit after failed push:', undoError.message);
                    } else {
                        log.error('Failed to undo commit after failed push:', undoError);
                    }
                }
                throw error;
            }
            // } else {
            // log.debug('No changes to push');
            // }
        } catch (error: unknown) {
            if (error instanceof Error) {
                log.error('Failed to push changes:', error.message);
            } else {
                log.error('Failed to push changes:', error);
            }
            throw error;
        }
    }

    async forcePush(): Promise<void> {
        const git = this.git;
        const repoUrl = getConfiguration().getRepositoryUrl();
        const branch = getConfiguration().getRepositoryBranch();
        await this.setupBranch(repoUrl, branch);
        try {
            if (getConfiguration().getPullBeforeForcePush()) {
                log.warn('Pull before force push enabled, stashing changes');
                await git.stash();
                await this.pull();
                log.debug('Applying stashed changes');
                await git.stash(['pop']);
            }
            const status = await git.status();
            if (!status.isClean()) {
                log.info('Changes detected, preparing force push');
                await git.add('.');
                await git.commit(FORCE_UPDATE_SETTINGS_COMMIT_MESSAGE);
                log.warn('Force pushing changes to remote');
                await git.push(['-u', '-f', 'origin', branch]);
                log.info('Force push completed successfully');
            } else {
                log.debug('No changes to force push');
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                log.error('Failed to force push changes:', error.message);
            } else {
                log.error('Failed to force push changes:', error);
            }
            throw error;
        }
    }

    async forcePull(): Promise<void> {
        const git = this.git;
        const repoUrl = getConfiguration().getRepositoryUrl();
        const branch = getConfiguration().getRepositoryBranch();
        await this.setupBranch(repoUrl, branch);
        try {
            log.debug('Fetching from origin');
            await git.fetch('origin');
            log.debug('Getting current branch name');
            const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
            log.warn(`Resetting to origin/${branch}`);
            await git.reset(['--hard', `origin/${branch}`]);
            log.info('Force pull completed successfully');
        } catch (error: unknown) {
            if (error instanceof Error) {
                log.error('Failed to force pull changes:', error.message);
            } else {
                log.error('Failed to force pull changes:', error);
            }
            throw error;
        }
    }

    async hasChanges(): Promise<boolean> {
        const git = this.git;
        try {
            log.trace('Checking repository status');
            const status = await git.status();
            const hasChanges = !status.isClean();
            log.debug(`Repository has changes: ${hasChanges}`);
            return hasChanges;
        } catch (error: unknown) {
            if (error instanceof Error) {
                log.error('Failed to check for changes:', error.message);
            } else {
                log.error('Failed to check for changes:', error);
            }
            throw error;
        }
    }

    async reinitialize(): Promise<void> {
        try {
            // Delete the existing repository if it exists
            if (fs.existsSync(this.gitDirectory)) {
                log.warn('Removing existing repository');
                await fs.promises.rm(this.gitDirectory, { recursive: true, force: true });
            }

            // Reset initialized state
            log.debug('Resetting initialization state');
            this.isInitialized = false;
            this._git = undefined;

            // Initialize again
            log.info('Starting reinitialization');
            await this.initialize();
            log.info('Reinitialization completed successfully');
        } catch (error: unknown) {
            if (error instanceof Error) {
                log.error('Failed to reinitialize repository:', error.message);
            } else {
                log.error('Failed to reinitialize repository:', error);
            }
            throw error;
        }
    }
}
