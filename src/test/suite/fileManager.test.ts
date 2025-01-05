// import * as assert from 'assert';
// import * as sinon from 'sinon';
// import * as vscode from 'vscode';
// import * as fs from 'fs';
// import * as path from 'path';
// import { FileManager } from '../../files/fileManager';

// suite('FileManager Tests', () => {
//     let fileManager: FileManager;
//     let fsModule: any;
//     let configStub: sinon.SinonStub;
//     let globStub: sinon.SinonStub;
//     let testWorkspaceDir: string;
//     let testAppDataDir: string;
//     let testWorkingDir: string;

//     setup(() => {
//         console.log('[FileManager Tests] Setting up test environment');
        
//         // Set up test directories relative to workspace
//         testWorkspaceDir = path.join(__dirname, '..', '..', '..', 'test-workspace');
//         testAppDataDir = path.join(testWorkspaceDir, 'appdata');
//         testWorkingDir = path.join(testWorkspaceDir, 'working-dir');
        
//         console.log('[FileManager Tests] Test directories:', {
//             testWorkspaceDir,
//             testAppDataDir,
//             testWorkingDir
//         });

//         // Create fs module stubs
//         fsModule = {
//             existsSync: sinon.stub(),
//             mkdirSync: sinon.stub(),
//             promises: {
//                 mkdir: sinon.stub().resolves(),
//                 copyFile: sinon.stub().resolves()
//             }
//         };
//         console.log('[FileManager Tests] Created fs module stubs');

//         // Set default behavior
//         fsModule.existsSync.returns(true);
//         console.log('[FileManager Tests] Set default existsSync behavior to return true');

//         // Create glob stub
//         globStub = sinon.stub().resolves([]);
//         console.log('[FileManager Tests] Created glob stub');

//         // Stub VS Code configuration
//         configStub = sinon.stub(vscode.workspace, 'getConfiguration');
//         configStub.returns({
//             get: sinon.stub().callsFake((key: string) => {
//                 if (key === 'patterns') {
//                     return ['**/*.json', '**/*.code-snippets'];
//                 }
//                 if (key === 'excludePatterns') {
//                     return [];
//                 }
//                 return undefined;
//             })
//         } as any);
//         console.log('[FileManager Tests] Created configuration stub with test patterns');

//         // Set APPDATA environment variable for Windows tests
//         process.env.APPDATA = testAppDataDir;
//         console.log('[FileManager Tests] Set APPDATA environment variable:', process.env.APPDATA);

//         // Create FileManager instance
//         fileManager = new FileManager(testWorkingDir, fsModule, globStub);
//         console.log('[FileManager Tests] Created FileManager instance with working dir:', testWorkingDir);
//     });

//     teardown(() => {
//         sinon.restore();
//     });

//     test('getUserSettingsPath returns correct path for Windows', () => {
//         console.log('[FileManager Tests] Testing getUserSettingsPath() for Windows');
//         const settingsPath = fileManager.getUserSettingsPath();
//         console.log('[FileManager Tests] Settings path returned:', settingsPath);
        
//         const expectedPath = path.join(testAppDataDir, 'Code', 'User');
//         assert.strictEqual(settingsPath, expectedPath);
//         console.log('[FileManager Tests] Verified path matches expected');
//     });

//     test('getUserSettingsPath creates directory if it does not exist', () => {
//         console.log('[FileManager Tests] Testing getUserSettingsPath() directory creation');
//         fsModule.existsSync.returns(false);
//         console.log('[FileManager Tests] Set existsSync to return false');
        
//         const settingsPath = fileManager.getUserSettingsPath();
//         console.log('[FileManager Tests] Settings path returned:', settingsPath);
        
//         const expectedPath = path.join(testAppDataDir, 'Code', 'User');
//         sinon.assert.calledWith(fsModule.mkdirSync, expectedPath, { recursive: true });
//         console.log('[FileManager Tests] Verified directory creation');
//     });

//     test('copyFile creates target directory and copies file', async () => {
//         console.log('[FileManager Tests] Testing copyFile()');
//         const sourcePath = path.join(testWorkspaceDir, 'source', 'file.txt');
//         const targetPath = path.join(testWorkspaceDir, 'target', 'dir', 'file.txt');
//         fsModule.existsSync.withArgs(sourcePath).returns(true);
//         console.log('[FileManager Tests] Set up source file to exist:', sourcePath);
        
//         await fileManager.copyFile(sourcePath, targetPath);
//         console.log('[FileManager Tests] Called copyFile()');
        
//         const targetDir = path.dirname(targetPath);
//         sinon.assert.calledWith(fsModule.promises.mkdir, targetDir, { recursive: true });
//         sinon.assert.calledWith(fsModule.promises.copyFile, sourcePath, targetPath);
//         console.log('[FileManager Tests] Verified directory creation and file copy');
//     });

//     test('copyFile handles non-existent source file', async () => {
//         console.log('[FileManager Tests] Testing copyFile() with non-existent source');
//         fsModule.existsSync.returns(false);
//         console.log('[FileManager Tests] Set existsSync to return false');
        
//         const sourcePath = path.join(testWorkspaceDir, 'source', 'file.txt');
//         const targetPath = path.join(testWorkspaceDir, 'target', 'dir', 'file.txt');
        
//         await fileManager.copyFile(sourcePath, targetPath);
//         console.log('[FileManager Tests] Called copyFile()');
        
//         sinon.assert.notCalled(fsModule.promises.mkdir);
//         sinon.assert.notCalled(fsModule.promises.copyFile);
//         console.log('[FileManager Tests] Verified no copy attempt was made');
//     });

//     test('copyFilesToWorkingDir copies all matched files', async () => {
//         console.log('[FileManager Tests] Testing copyFilesToWorkingDir()');
//         const patterns = ['**/*.json', '**/*.code-snippets'];
//         const matchedFiles = [
//             path.join(testAppDataDir, 'Code', 'User', 'settings.json'),
//             path.join(testAppDataDir, 'Code', 'User', 'keybindings.json')
//         ];
        
//         // Mock glob to return matched files
//         globStub.resolves(matchedFiles);
//         console.log('[FileManager Tests] Set up glob stub to return:', matchedFiles);
        
//         // Mock existsSync to return true for all files
//         fsModule.existsSync.returns(true);
        
//         await fileManager.copyFilesToWorkingDir();
//         console.log('[FileManager Tests] Called copyFilesToWorkingDir()');
        
//         // Verify glob was called with correct patterns
//         sinon.assert.calledWith(globStub, patterns, {
//             ignore: [],
//             dot: true,
//             absolute: true,
//             cwd: path.join(testAppDataDir, 'Code', 'User')
//         });
        
//         // Verify each file was copied
//         for (const file of matchedFiles) {
//             const relativePath = path.relative(path.join(testAppDataDir, 'Code', 'User'), file);
//             const targetPath = path.join(testWorkingDir, relativePath);
//             sinon.assert.calledWith(fsModule.promises.copyFile, file, targetPath);
//         }
        
//         console.log('[FileManager Tests] Verified file copying');
//     });

//     test('copyFilesFromWorkingDir copies all matched files', async () => {
//         console.log('[FileManager Tests] Testing copyFilesFromWorkingDir()');
//         const patterns = ['**/*.json', '**/*.code-snippets'];
//         const matchedFiles = [
//             path.join(testWorkingDir, 'settings.json'),
//             path.join(testWorkingDir, 'keybindings.json')
//         ];
        
//         // Mock glob to return matched files
//         globStub.resolves(matchedFiles);
//         console.log('[FileManager Tests] Set up glob stub to return:', matchedFiles);
        
//         // Mock existsSync to return true for all files
//         fsModule.existsSync.returns(true);
        
//         await fileManager.copyFilesFromWorkingDir();
//         console.log('[FileManager Tests] Called copyFilesFromWorkingDir()');
        
//         // Verify glob was called with correct patterns
//         sinon.assert.calledWith(globStub, patterns, {
//             ignore: [],
//             dot: true,
//             absolute: true,
//             cwd: testWorkingDir
//         });
        
//         // Verify each file was copied
//         for (const file of matchedFiles) {
//             const relativePath = path.relative(testWorkingDir, file);
//             const targetPath = path.join(testAppDataDir, 'Code', 'User', relativePath);
//             sinon.assert.calledWith(fsModule.promises.copyFile, file, targetPath);
//         }
        
//         console.log('[FileManager Tests] Verified file copying');
//     });
// }); 