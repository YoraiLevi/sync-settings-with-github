import * as vscode from 'vscode';
import { getConfiguration } from './configuration';
import path from 'path';
import { SyncService } from '../sync/syncService';
import { WatcherService } from '../files/watcherService';

export function setupOnSettingsChange(syncService: SyncService, watcherService: WatcherService) {
    const settingsFsPath = vscode.Uri.file(getConfiguration().getUserSettingsPath().fsPath);
    const settingsFileJson = path.join(settingsFsPath.fsPath, 'settings.json');
    const settingsFilePattern = new vscode.RelativePattern(settingsFsPath, 'settings.json');
    function setupWatcher() {
        watcherService.listenOnFileChange(onSettingsChange);
        watcherService.watchPatterns([settingsFilePattern]);
    }
    async function onSettingsChange(uris: Array<vscode.Uri>) {
        if (uris.map(uri => uri.fsPath).includes(settingsFileJson)) {
            console.log('Settings changed', uris);
            syncService.teardownWatchers();
            syncService.setupWatchers();
            setupWatcher();
        }
    }
    setupWatcher();
}