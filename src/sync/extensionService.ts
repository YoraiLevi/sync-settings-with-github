import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Configuration } from '../config/configuration';

function log(message: string, ...args: any[]) {
    console.log(`[ExtensionService] ${message}`, ...args);
}

export interface ExtensionInfo {
    id: string;
    version?: string;
}

export class ExtensionService {
    private readonly extensionsFile: string;

    constructor(private workingDir: string) {
        this.extensionsFile = path.join(this.workingDir, 'extensions.json');
    }

    async pushExtensions(): Promise<void> {
        if (!Configuration.shouldSyncExtensions()) {
            log('Extension sync is disabled');
            return;
        }

        try {
            const currentExtensions = this.getCurrentExtensions();
            await this.saveExtensionsToFile(currentExtensions);
            log('Extensions pushed to sync file');
        } catch (error) {
            log('Error during extension push:', error);
            throw error;
        }
    }

    async pullExtensions(): Promise<void> {
        if (!Configuration.shouldSyncExtensions()) {
            log('Extension sync is disabled');
            return;
        }

        try {
            const syncedExtensions = await this.readSyncedExtensions();
            if (!syncedExtensions) {
                log('No synced extensions found');
                return;
            }

            await this.installMissingExtensions(syncedExtensions);

            if (Configuration.shouldAutoRemoveExtensions()) {
                await this.removeExtraExtensions(syncedExtensions);
            }
        } catch (error) {
            log('Error during extension pull:', error);
            throw error;
        }
    }

    private getCurrentExtensions(): ExtensionInfo[] {
        const extensions = vscode.extensions.all
            .filter(ext => !ext.packageJSON.isBuiltin) // Filter out built-in extensions
            .map(ext => ({
                id: ext.id,
                version: ext.packageJSON.version
            }));
        
        log('Current extensions:', extensions);
        return extensions;
    }

    private async saveExtensionsToFile(extensions: ExtensionInfo[]): Promise<void> {
        try {
            await fs.promises.writeFile(this.extensionsFile, JSON.stringify(extensions, null, 2));
            log('Extensions saved to file');
        } catch (error) {
            log('Error saving extensions to file:', error);
            throw error;
        }
    }

    private async readSyncedExtensions(): Promise<ExtensionInfo[] | null> {
        try {
            if (!fs.existsSync(this.extensionsFile)) {
                return null;
            }
            const content = await fs.promises.readFile(this.extensionsFile, 'utf-8');
            const extensions = JSON.parse(content) as ExtensionInfo[];
            log('Read synced extensions:', extensions);
            return extensions;
        } catch (error) {
            log('Error reading synced extensions:', error);
            throw error;
        }
    }

    private async installMissingExtensions(syncedExtensions: ExtensionInfo[]): Promise<void> {
        const currentExtensions = vscode.extensions.all.map(ext => ext.id);
        const extensionsToInstall = syncedExtensions.filter(ext => !currentExtensions.includes(ext.id));

        if (extensionsToInstall.length === 0) {
            log('No missing extensions to install');
            return;
        }

        log('Installing missing extensions:', extensionsToInstall);
        for (const ext of extensionsToInstall) {
            try {
                log(`Installing extension: ${ext.id}`);
                await vscode.commands.executeCommand('workbench.extensions.installExtension', ext.id);
                log(`Successfully installed extension: ${ext.id}`);
            } catch (error) {
                log(`Error installing extension ${ext.id}:`, error);
                // Continue with other extensions even if one fails
            }
        }
    }

    private async removeExtraExtensions(syncedExtensions: ExtensionInfo[]): Promise<void> {
        const syncedExtensionIds = syncedExtensions.map(ext => ext.id);
        const extraExtensions = vscode.extensions.all
            .filter(ext => !ext.packageJSON.isBuiltin && !syncedExtensionIds.includes(ext.id));

        if (extraExtensions.length === 0) {
            log('No extra extensions to remove');
            return;
        }

        log('Removing extra extensions:', extraExtensions.map(ext => ext.id));
        for (const ext of extraExtensions) {
            try {
                log(`Removing extension: ${ext.id}`);
                await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', ext.id);
                log(`Successfully removed extension: ${ext.id}`);
            } catch (error) {
                log(`Error removing extension ${ext.id}:`, error);
                // Continue with other extensions even if one fails
            }
        }
    }
} 