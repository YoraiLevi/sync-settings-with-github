// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitService } from './gitService';
import { SyncService } from './syncService';
import { WatcherService } from './watcherService';
import { Configuration } from './utils/configuration';
import { createLogger, LogLevel } from './utils/logUtils';

const log = createLogger({
    serviceName: 'Extension',
    minLevel: LogLevel.INFO
});

let syncService: SyncService;
let statusBarItem: vscode.StatusBarItem;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    return;
    log.info('Activating extension');

    const configuration = new Configuration(context);
    const gitService = new GitService();
    const watcherService = new WatcherService();
    syncService = new SyncService(gitService, watcherService);

    // Create status bar item
    log.debug('Creating status bar item');
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(sync) Settings Sync";
    statusBarItem.tooltip = "Click to manage settings sync";
    statusBarItem.command = 'sync-settings-with-github.toggleSync';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register commands
    log.debug('Registering commands');
    const commands = {
        'sync-settings-with-github.initialize': async () => {
            log.info('Initializing sync service');
            await syncService.initialize();
        },
        'sync-settings-with-github.forcePush': async () => {
            log.info('Force pushing settings');
            await syncService.forcePush();
        },
        'sync-settings-with-github.forcePull': async () => {
            log.info('Force pulling settings');
            await syncService.forcePull();
        },
        'sync-settings-with-github.sync': async () => {
            log.info('Syncing settings');
            await syncService.sync();
        },
        'sync-settings-with-github.toggleSync': () => {
            const newState = !configuration.getSyncEnabled();
            log.info('Toggling sync:', newState ? 'enabled' : 'disabled');
            configuration.setSyncEnabled(newState);
            return `Settings sync ${newState ? 'enabled' : 'disabled'}`;
        },
        'sync-settings-with-github.openRepository': () => {
            log.info('Opening repository in new window');
            const terminal = vscode.window.createTerminal('Settings Sync');
            terminal.sendText(`code ${gitService.gitDirectory}`);
            terminal.show();
        },
        'sync-settings-with-github.reinitialize': async () => {
            log.info('Reinitializing git service');
            await gitService.reinitialize();
        },
    };

    const disposables = Object.entries(commands).map(([commandId, handler]) =>
        vscode.commands.registerCommand(commandId, async () => {
            try {
                log.debug('Executing command:', commandId);
                const result = await handler();
                if (result) {
                    vscode.window.showInformationMessage(result);
                }
            } catch (error) {
                log.error('Command execution failed:', commandId, error);
                vscode.window.showErrorMessage(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    );

    context.subscriptions.push(...disposables);
    log.info('Extension activated successfully');
}

// This method is called when your extension is deactivated
export function deactivate() {
    log.info('Deactivating extension');
    if (syncService) {
        syncService.dispose();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    log.info('Extension deactivated successfully');
}
