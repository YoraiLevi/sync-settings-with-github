import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

function log(message: string, ...args: any[]) {
    console.log(`[ExtensionService] ${message}`, ...args);
}

export interface ExtensionInfo {
    id: string;
    version?: string;
}

export class ExtensionService {
    constructor(private workingDir: string) {}

    async pushExtensions(): Promise<void> {
        const config = vscode.workspace.getConfiguration('settingsSync');
        const shouldSync = config.get<boolean>('extensions.sync', true);

        if (!shouldSync) {
            log('Extension sync is disabled');
            return;
        }

        try {
            // Get current extensions and save them to file
            const currentExtensions = await this.getCurrentExtensions();
            await this.saveExtensionsToFile(currentExtensions);
            log('Extensions pushed to sync file');
        } catch (error) {
            log('Error during extension push:', error);
            throw error;
        }
    }

    async pullExtensions(): Promise<void> {
        const config = vscode.workspace.getConfiguration('settingsSync');
        const shouldSync = config.get<boolean>('extensions.sync', true);
        const shouldAutoRemove = config.get<boolean>('extensions.autoRemove', false);

        if (!shouldSync) {
            log('Extension sync is disabled');
            return;
        }

        try {
            // Read synced extensions from file
            const syncedExtensions = await this.readSyncedExtensions();
            if (!syncedExtensions) {
                log('No synced extensions found');
                return;
            }

            // Install missing extensions
            await this.installMissingExtensions(syncedExtensions);

            // Remove extra extensions if enabled
            if (shouldAutoRemove) {
                await this.removeExtraExtensions(syncedExtensions);
            }
        } catch (error) {
            log('Error during extension pull:', error);
            throw error;
        }
    }

    private async getCurrentExtensions(): Promise<ExtensionInfo[]> {
        const extensions = vscode.extensions.all
            .filter(ext => !ext.packageJSON.isBuiltin) // Filter out built-in extensions
            .map(ext => ({
                id: ext.id,
                version: ext.packageJSON.version
            }));
        
        log('Current extensions:', extensions);
        return extensions;
    }

    private getExtensionsFromStandardApi(): ExtensionInfo[] {
        // Use the standard API as fallback
        const extensions = vscode.extensions.all
            .filter(ext => !ext.packageJSON.isBuiltin)
            .map(ext => ({
                id: ext.id,
                version: ext.packageJSON.version
            }));
        
        log('Extensions from standard API:', extensions);
        return extensions;
    }

    private async saveExtensionsToFile(extensions: ExtensionInfo[]): Promise<void> {
        const filePath = path.join(this.workingDir, 'extensions.json');
        try {
            await fs.promises.writeFile(filePath, JSON.stringify(extensions, null, 2));
            log('Extensions saved to file');
        } catch (error) {
            log('Error saving extensions to file:', error);
            throw error;
        }
    }

    private async readSyncedExtensions(): Promise<ExtensionInfo[] | null> {
        const filePath = path.join(this.workingDir, 'extensions.json');
        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }
            const content = await fs.promises.readFile(filePath, 'utf-8');
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