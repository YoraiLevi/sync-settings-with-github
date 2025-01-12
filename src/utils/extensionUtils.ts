import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getConfiguration } from './configuration';
import { saveJsonToFile, readJsonFromFile } from './JsonUtils';
import { createLogger, LogLevel } from './logUtils';

const log = createLogger({
    serviceName: 'ExtensionUtils',
    minLevel: LogLevel.INFO
});

export interface ExtensionInfo {
    id: string;
    version?: string;
}

export async function pushExtensions(extensionsFile: string): Promise<void> {
    try {
        const currentExtensions = getCurrentExtensions();
        await saveJsonToFile(extensionsFile, currentExtensions);
        log.info('Extensions pushed to sync file');
    } catch (error) {
        log.error('Error during extension push:', error);
        throw error;
    }
}

export async function pullExtensions(extensionsFile: string): Promise<void> {
    try {
        const syncedExtensions = await readJsonFromFile(extensionsFile);
        if (!syncedExtensions) {
            log.warn('No synced extensions found');
            return;
        }

        await installMissingExtensions(syncedExtensions);

        if (getConfiguration().shouldAutoRemoveExtensions()) {
            await removeExtraExtensions(syncedExtensions);
        }
    } catch (error) {
        log.error('Error during extension pull:', error);
        throw error;
    }
}

export function getCurrentExtensions(): ExtensionInfo[] {
    const extensions = vscode.extensions.all
        .filter(ext => !ext.packageJSON.isBuiltin) // Filter out built-in extensions
        .map(ext => ({
            id: ext.id,
            version: ext.packageJSON.version
        }));

    log.debug('Current extensions:', extensions);
    return extensions;
}

export async function installMissingExtensions(syncedExtensions: ExtensionInfo[]): Promise<void> {
    const currentExtensions = vscode.extensions.all.map(ext => ext.id);
    const extensionsToInstall = syncedExtensions.filter(ext => !currentExtensions.includes(ext.id));

    if (extensionsToInstall.length === 0) {
        log.debug('No missing extensions to install');
        return;
    }

    log.info('Installing missing extensions:', extensionsToInstall);
    for (const ext of extensionsToInstall) {
        try {
            log.debug(`Installing extension: ${ext.id}`);
            await vscode.commands.executeCommand('workbench.extensions.installExtension', ext.id);
            log.info(`Successfully installed extension: ${ext.id}`);
        } catch (error) {
            log.error(`Error installing extension ${ext.id}:`, error);
            // Continue with other extensions even if one fails
        }
    }
}

export async function removeExtraExtensions(syncedExtensions: ExtensionInfo[]): Promise<void> {
    const syncedExtensionIds = syncedExtensions.map(ext => ext.id);
    const extraExtensions = vscode.extensions.all
        .filter(ext => !ext.packageJSON.isBuiltin && !syncedExtensionIds.includes(ext.id));

    if (extraExtensions.length === 0) {
        log.debug('No extra extensions to remove');
        return;
    }

    log.warn('Removing extra extensions:', extraExtensions.map(ext => ext.id));
    for (const ext of extraExtensions) {
        try {
            log.debug(`Removing extension: ${ext.id}`);
            await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', ext.id);
            log.info(`Successfully removed extension: ${ext.id}`);
        } catch (error) {
            log.error(`Error removing extension ${ext.id}:`, error);
            // Continue with other extensions even if one fails
        }
    }
}