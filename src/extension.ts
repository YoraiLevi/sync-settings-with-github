// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitService } from './git/gitService';
import { SyncService } from './sync/syncService';

let syncService: SyncService;
let statusBarItem: vscode.StatusBarItem;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	console.log('Settings sync extension is now active');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);
	statusBarItem.text = "$(sync) Settings Sync";
	statusBarItem.command = 'sync-settings-with-github.toggleSync';
	context.subscriptions.push(statusBarItem);

	// Initialize services
	const gitService = new GitService(context);
	syncService = new SyncService(context, gitService);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('sync-settings-with-github.initialize', () => syncService.initialize()),
		vscode.commands.registerCommand('sync-settings-with-github.forcePush', () => syncService.forcePush()),
		vscode.commands.registerCommand('sync-settings-with-github.forcePull', () => syncService.forcePull()),
		vscode.commands.registerCommand('sync-settings-with-github.sync', () => syncService.sync()),
		vscode.commands.registerCommand('sync-settings-with-github.toggleSync', () => syncService.toggleEnabled()),
		vscode.commands.registerCommand('sync-settings-with-github.openRepository', () => gitService.openRepository()),
		vscode.commands.registerCommand('sync-settings-with-github.reinitialize', async () => {
			const answer = await vscode.window.showWarningMessage(
				'This will delete and reinitialize the local repository. Are you sure?',
				'Yes', 'No'
			);

			if (answer === 'Yes') {
				try {
					await gitService.reinitialize();
					vscode.window.showInformationMessage('Repository reinitialized successfully');
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to reinitialize: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		})
	);

	// Try to initialize if already configured
	const config = vscode.workspace.getConfiguration('settingsSync.git');
	const repoUrl = config.get<string>('repositoryUrl');
	if (repoUrl) {
		try {
			await syncService.initialize();
			statusBarItem.show();
		} catch (error) {
			console.error('Failed to initialize sync service:', error);
		}
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (syncService) {
		syncService.dispose();
	}
}
