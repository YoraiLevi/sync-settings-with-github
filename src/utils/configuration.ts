import * as vscode from 'vscode';
import * as fs from 'fs';
interface FilePattern {
    baseDir: string;
    patterns: string[];
    excludePatterns: string[];
    conditions: { [key: string]: string };
}
export class Configuration {
    static instance: Configuration;
    constructor(private context: vscode.ExtensionContext) {
        if (!Configuration.instance) {
            Configuration.instance = this;
        }
        return Configuration.instance;
    }

    public getFilePatterns(): FilePattern[] {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<FilePattern[]>('files', []);
    }

    public getUserSettingsPath(): vscode.Uri {
        if (!this.context) {
            throw new Error('[Configuration] Context is not initialized');
        }
        return vscode.Uri.file(fs.realpathSync(this.context.globalStorageUri.fsPath + "/../../"));
    }

    public getRepositoryUrl(): string | undefined {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<string | undefined>('repositoryUrl');
    }

    public getRepositoryBranch(): string {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<string>('branch', 'main');
    }

    public getPullBeforePush(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('pullBeforePush', true);
    }

    public getPullBeforeForcePush(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('pullBeforeForcePush', false);
    }

    public getSyncEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('syncEnabled', true);
    }

    public setSyncEnabled(enabled: boolean): void {
        const config = vscode.workspace.getConfiguration('settingsSync');
        config.update('syncEnabled', enabled);
    }

    public getSyncInterval(): number {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<number>('syncInterval', 300) * 1000; // Convert to milliseconds
    }

    public getDebounceDelay(): number {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<number>('debounceDelay', 5) * 1000; // Convert to milliseconds
    }

    public shouldPullOnLaunch(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('pullOnLaunch', true);
    }

    public shouldSyncExtensions(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('extensions.sync', true);
    }

    public shouldAutoRemoveExtensions(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('extensions.autoRemove', false);
    }

    public isAutoSyncEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('settingsSync');
        return config.get<boolean>('autoSync', true);
    }

}
export function getConfiguration(): Configuration {
    if (!Configuration.instance) {
        throw new Error('Configuration instance not initialized');
    }
    return Configuration.instance;
}

