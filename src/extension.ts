// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitService } from './git/gitService';
import { SyncService } from './sync/syncService';
import { ExtensionService } from './sync/extensionService';

let syncService: SyncService;
let statusBarItem: vscode.StatusBarItem;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const gitService = new GitService(context);
	const extensionService = new ExtensionService(gitService.getWorkingDirectory());
	syncService = new SyncService(context, gitService, extensionService);

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "$(sync) Settings Sync";
	statusBarItem.tooltip = "Click to manage settings sync";
	statusBarItem.command = 'sync-settings-with-github.toggleSync';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('sync-settings-with-github.initialize', async () => {
			try {
				await syncService.initialize();
				vscode.window.showInformationMessage('Settings sync initialized successfully');
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to initialize settings sync: ${error}`);
			}
		}),
		vscode.commands.registerCommand('sync-settings-with-github.forcePush', async () => {
			try {
				await syncService.forcePush();
				vscode.window.showInformationMessage('Settings force pushed successfully');
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to force push settings: ${error}`);
			}
		}),
		vscode.commands.registerCommand('sync-settings-with-github.forcePull', async () => {
			try {
				await syncService.forcePull();
				vscode.window.showInformationMessage('Settings force pulled successfully');
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to force pull settings: ${error}`);
			}
		}),
		vscode.commands.registerCommand('sync-settings-with-github.sync', async () => {
			try {
				await syncService.sync();
				vscode.window.showInformationMessage('Settings synced successfully');
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to sync settings: ${error}`);
			}
		}),
		vscode.commands.registerCommand('sync-settings-with-github.toggleSync', () => {
			syncService.toggleEnabled();
			vscode.window.showInformationMessage(`Settings sync ${syncService.enabled ? 'enabled' : 'disabled'}`);
		}),
		vscode.commands.registerCommand('sync-settings-with-github.openRepository', () => {
			const terminal = vscode.window.createTerminal('Settings Sync');
			terminal.sendText(`code ${gitService.getWorkingDirectory()}`);
			terminal.show();
		}),
		vscode.commands.registerCommand('sync-settings-with-github.reinitialize', async () => {
			try {
				await gitService.reinitialize();
				await syncService.initialize();
				vscode.window.showInformationMessage('Settings sync reinitialized successfully');
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to reinitialize settings sync: ${error}`);
			}
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (syncService) {
		syncService.dispose();
	}
	if (statusBarItem) {
		statusBarItem.dispose();
	}
}
