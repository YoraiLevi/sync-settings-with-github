// import * as assert from 'assert';
// import * as vscode from 'vscode';
// import * as sinon from 'sinon';
// import { WatcherService } from '../../files/watcherService';
// // import { FileManager } from '../../files/fileManager';
// import { Configuration } from '../../config/configuration';

// suite('WatcherService Tests', () => {
//     let watcherService: WatcherService;
//     let fileManager: Partial<FileManager>;
//     let onFileChange: sinon.SinonStub;
//     let createFileSystemWatcherStub: sinon.SinonStub;
//     let configStub: sinon.SinonStub;
//     let clock: sinon.SinonFakeTimers;
//     let mockWatcher: vscode.FileSystemWatcher;

//     setup(() => {
//         // Create stubs
//         onFileChange = sinon.stub();
//         fileManager = {
//             getUserSettingsPath: sinon.stub().returns('/test/path'),
//         };

//         // Stub the file system watcher
//         mockWatcher = {
//             onDidChange: sinon.stub(),
//             onDidCreate: sinon.stub(),
//             onDidDelete: sinon.stub(),
//             dispose: sinon.stub(),
//         } as unknown as vscode.FileSystemWatcher;

//         createFileSystemWatcherStub = sinon.stub(vscode.workspace, 'createFileSystemWatcher').returns(mockWatcher);

//         // Stub configuration
//         configStub = sinon.stub(Configuration, 'getFilePatterns').returns({
//             patterns: ['test.json'],
//             excludePatterns: []
//         });

//         // Create fake timer
//         clock = sinon.useFakeTimers();

//         // Create service instance
//         watcherService = new WatcherService(fileManager as FileManager, onFileChange);
//     });

//     teardown(() => {
//         sinon.restore();
//         clock.restore();
//     });

//     test('setupFileWatcher creates watchers for configured patterns', async () => {
//         await watcherService.watchPatterns();

//         sinon.assert.calledOnce(createFileSystemWatcherStub);
//         sinon.assert.calledOnce(fileManager.getUserSettingsPath as sinon.SinonStub);
        
//         sinon.assert.calledOnce(mockWatcher.onDidChange as sinon.SinonStub);
//         sinon.assert.calledOnce(mockWatcher.onDidCreate as sinon.SinonStub);
//         sinon.assert.calledOnce(mockWatcher.onDidDelete as sinon.SinonStub);
//     });

//     test('handleFileChange debounces multiple rapid changes', async () => {
//         const uri = vscode.Uri.file('/test/file.json');

//         // Trigger multiple changes rapidly
//         watcherService.handleFileChange(uri);
//         watcherService.handleFileChange(uri);
//         watcherService.handleFileChange(uri);

//         // Fast-forward past debounce delay
//         await clock.tickAsync(6000);

//         // Should only call onFileChange once
//         sinon.assert.calledOnce(onFileChange);
//     });

//     test('dispose cleans up watchers and timers', async () => {
//         await watcherService.watchPatterns();

//         // Setup a debounced change
//         watcherService.handleFileChange(vscode.Uri.file('/test/file.json'));

//         watcherService.dispose();

//         sinon.assert.calledOnce(mockWatcher.dispose as sinon.SinonStub);
        
//         // Fast-forward - the debounced change should not fire
//         await clock.tickAsync(6000);
//         sinon.assert.notCalled(onFileChange);
//     });
// }); 