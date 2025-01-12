import * as vscode from 'vscode';
import * as fs from 'fs';
import { resolveVSCodeVariables } from './pathUtils';
import * as path from 'path';
export interface FilePattern {
    baseDir: string;
    remoteDir: string;
    patterns: string[];
    excludePatterns?: string[];
    conditions?: { [key: string]: string };

}
export class Configuration {
    static instance: Configuration | null = null; // explicitly set to null to make it possible to mock in tests, sinon.replace complains of undefined and sinon.define complains of already defined
    constructor(private context: vscode.ExtensionContext) {
        if (!Configuration.instance) {
            Configuration.instance = this;
        }
        return Configuration.instance;
    }
    public getContext(): vscode.ExtensionContext {
        if (!this.context) {
            throw new Error('[Configuration] Context is not initialized');
        }
        return this.context;
    }
    public getRootConfiguration() {
        return vscode.workspace.getConfiguration('settingsSync');
    }
    public getExtensionFileRemoteDir(): string {
        const config = this.getRootConfiguration();
        const remoteDir = config.get<string>('extensions.remoteDir', './');
        return remoteDir;
    }
    public getFilePatterns(): FilePattern[] {
        const config = this.getRootConfiguration();
        let files = config.get<FilePattern[]>('files', []);
        files = files.filter(entry => {
            let conditions = entry.conditions || {};
            if (entry.conditions && typeof entry.conditions !== typeof ({})) {
                throw new Error('Conditions are not an object');
            }
            if (entry.conditions) {
                const allConditionsMet = Object.keys(conditions).reduce((result: boolean, condition: string) => {
                    return result && (process.env[condition] === conditions[condition]);
                }, true);
                return allConditionsMet;
            }
            return true;
        });

        for (let file of files) {
            if (!file.baseDir) {
                file.baseDir = this.getUserSettingsPath().fsPath;
            }
            if (!file.remoteDir) {
                file.remoteDir = './';
            }
            file.baseDir = resolveVSCodeVariables(file.baseDir);
            file.remoteDir = path.join(this.getRepositoryPath().fsPath, resolveVSCodeVariables(file.remoteDir));
        }
        return files;
    }
    public getGlobalStoragePath(): vscode.Uri {
        let context = this.getContext();
        return context.globalStorageUri;
    }
    public getUserSettingsPath(): vscode.Uri {
        return vscode.Uri.file(fs.realpathSync(this.getGlobalStoragePath().fsPath + "/../../"));
    }

    public getRepositoryPath(): vscode.Uri {
        return vscode.Uri.file(path.join(this.getGlobalStoragePath().fsPath, 'repository'));
    }
    public getRepositoryUrl(): string {
        const config = this.getRootConfiguration();
        return config.get<string>('repositoryUrl', '');
    }

    public getRepositoryBranch(): string {
        const config = this.getRootConfiguration();
        return config.get<string>('branch', 'main');
    }

    public getPullBeforePush(): boolean {
        const config = this.getRootConfiguration();
        return config.get<boolean>('pullBeforePush', true);
    }

    public getPullBeforeForcePush(): boolean {
        const config = this.getRootConfiguration();
        return config.get<boolean>('pullBeforeForcePush', false);
    }

    public getSyncEnabled(): boolean {
        const config = this.getRootConfiguration();
        return config.get<boolean>('syncEnabled', true);
    }

    public setSyncEnabled(enabled: boolean): void {
        const config = this.getRootConfiguration();
        config.update('syncEnabled', enabled);
    }

    public getSyncInterval(): number {
        const config = this.getRootConfiguration();
        return config.get<number>('syncInterval', 300) * 1000; // Convert to milliseconds
    }

    public getDebounceDelay(): number {
        const config = this.getRootConfiguration();
        return config.get<number>('debounceDelay', 5) * 1000; // Convert to milliseconds
    }

    public shouldPullOnLaunch(): boolean {
        const config = this.getRootConfiguration();
        return config.get<boolean>('pullOnLaunch', true);
    }

    public shouldSyncExtensions(): boolean {
        const config = this.getRootConfiguration();
        return config.get<boolean>('extensions.sync', true);
    }

    public shouldAutoRemoveExtensions(): boolean {
        const config = this.getRootConfiguration();
        return config.get<boolean>('extensions.autoRemove', false);
    }

    public isAutoSyncEnabled(): boolean {
        const config = this.getRootConfiguration();
        return config.get<boolean>('autoSync', true);
    }

}
export function getConfiguration(): Configuration {
    if (!Configuration.instance) {
        throw new Error('Configuration instance not initialized');
    }
    return Configuration.instance;
}

