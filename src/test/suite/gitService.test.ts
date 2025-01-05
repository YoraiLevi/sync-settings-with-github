// import * as assert from 'assert';
// import * as vscode from 'vscode';
// import * as sinon from 'sinon';
// import * as path from 'path';
// import * as fs from 'fs';
// import { GitService } from '../../git/gitService';
// import { SimpleGit, StatusResult } from 'simple-git';

// suite('GitService Tests', () => {
//     let gitService: GitService;
//     let context: vscode.ExtensionContext;
//     let gitStub: sinon.SinonStubbedInstance<SimpleGit>;
//     let fsModule: {
//         existsSync: sinon.SinonStub;
//         mkdirSync: sinon.SinonStub;
//         rmdirSync: sinon.SinonStub;
//         promises: {
//             rm: sinon.SinonStub;
//             mkdir: sinon.SinonStub;
//         };
//     };
//     let configStub: sinon.SinonStub;
//     let testWorkspaceDir: string;
//     let testExtensionDir: string;
//     let testStorageDir: string;
//     let testSettingsSyncDir: string;

//     const createStatusResult = (changes: Partial<StatusResult> = {}): StatusResult => ({
//         modified: [],
//         not_added: [],
//         deleted: [],
//         created: [],
//         renamed: [],
//         conflicted: [],
//         staged: [],
//         ahead: 0,
//         behind: 0,
//         current: 'tests',
//         tracking: 'origin/tests',
//         files: [],
//         isClean: () => true,
//         detached: false,
//         ...changes
//     }) as StatusResult;

//     setup(() => {
//         console.log('[GitService Tests] Setting up test environment');
        
//         // Set up test directories relative to workspace
//         testWorkspaceDir = path.join(__dirname, '..', '..', '..', 'test-workspace');
//         testExtensionDir = path.join(testWorkspaceDir, 'extension');
//         testStorageDir = path.join(testWorkspaceDir, 'storage');
//         testSettingsSyncDir = path.join(testStorageDir, 'settings-sync');
        
//         console.log('[GitService Tests] Test directories:', {
//             testWorkspaceDir,
//             testExtensionDir,
//             testStorageDir,
//             testSettingsSyncDir
//         });

//         // Create extension context stub
//         context = {
//             extensionPath: testExtensionDir,
//             globalStoragePath: testStorageDir,
//             subscriptions: []
//         } as any;
//         console.log('[GitService Tests] Created extension context:', context);

//         // Create a copy of fs module with stubbed functions
//         fsModule = {
//             existsSync: sinon.stub(),
//             mkdirSync: sinon.stub(),
//             rmdirSync: sinon.stub(),
//             promises: {
//                 rm: sinon.stub().resolves(),
//                 mkdir: sinon.stub().resolves()
//             }
//         };
//         console.log('[GitService Tests] Created fs module stubs');

//         // Set default behavior - ensure working directory exists by default
//         fsModule.existsSync.callsFake((p: string) => {
//             console.log(`[GitService Tests] Checking if path exists: ${p}`);
//             // Return true for the working directory but false for .git
//             if (p === testSettingsSyncDir) {
//                 return true;
//             }
//             if (p.endsWith('.git')) {
//                 return false;
//             }
//             return true;
//         });
//         console.log('[GitService Tests] Set up existsSync behavior');

//         // Create git stub with full StatusResult
//         gitStub = {
//             init: sinon.stub().resolves(),
//             addRemote: sinon.stub().resolves(),
//             removeRemote: sinon.stub().resolves(),
//             fetch: sinon.stub().resolves(),
//             pull: sinon.stub().resolves(),
//             push: sinon.stub().resolves(),
//             status: sinon.stub().resolves(createStatusResult()),
//             checkout: sinon.stub().resolves(),
//             add: sinon.stub().resolves(),
//             commit: sinon.stub().resolves(),
//             reset: sinon.stub().resolves(),
//             revparse: sinon.stub().resolves('tests'),
//             checkoutLocalBranch: sinon.stub().resolves()
//         } as unknown as sinon.SinonStubbedInstance<SimpleGit>;
//         console.log('[GitService Tests] Created git stubs');

//         // Stub VS Code configuration
//         configStub = sinon.stub(vscode.workspace, 'getConfiguration');
//         configStub.returns({
//             get: sinon.stub().callsFake((key: string) => {
//                 const value = key === 'repository' ? 'https://github.com/YoraiLevi/settings-test' : 
//                              key === 'branch' ? 'tests' : undefined;
//                 console.log(`[GitService Tests] Getting config value for ${key} -> ${value}`);
//                 return value;
//             })
//         } as any);
//         console.log('[GitService Tests] Created configuration stubs');

//         // Create service instance with stubbed fs module
//         gitService = new GitService(context, fsModule as unknown as typeof fs);
//         (gitService as any).git = gitStub;
//         console.log('[GitService Tests] Created GitService instance');

//         // Ensure the directory exists for simple-git
//         if (!fs.existsSync(testSettingsSyncDir)) {
//             fs.mkdirSync(testSettingsSyncDir, { recursive: true });
//             console.log('[GitService Tests] Created settings sync directory');
//         }
//     });

//     teardown(async () => {
//         sinon.restore();
//         // Clean up the test directory
//         try {
//             await fs.promises.rm(testSettingsSyncDir, { recursive: true, force: true });
//             console.log('[GitService Tests] Cleaned up settings sync directory');
//         } catch (error) {
//             console.log('[GitService Tests] Error cleaning up settings sync directory:', error);
//         }
//     });

//     test('initialize creates working directory and initializes git', async () => {
//         console.log('[GitService Tests] Testing initialize()');
//         fsModule.existsSync.returns(false);
//         gitStub.removeRemote.rejects(new Error('Remote does not exist'));
//         console.log('[GitService Tests] Set existsSync to return false');
        
//         await gitService.initialize();
//         console.log('[GitService Tests] Called initialize()');
        
//         sinon.assert.calledWith(fsModule.promises.mkdir, testSettingsSyncDir, { recursive: true });
//         sinon.assert.calledWith(gitStub.init);
//         sinon.assert.calledWith(gitStub.addRemote, 'origin', 'https://github.com/YoraiLevi/settings-test');
//         sinon.assert.calledWith(gitStub.checkout, ['-b', 'tests']);
//         console.log('[GitService Tests] Verified git initialization');
//     });

//     test('hasChanges detects modified files', async () => {
//         console.log('[GitService Tests] Testing hasChanges() with modified files');
//         fsModule.existsSync.returns(true);
//         gitStub.status.resolves({
//             modified: ['file.txt'],
//             not_added: [],
//             deleted: [],
//             created: [],
//             renamed: [],
//             conflicted: [],
//             staged: [],
//             files: [{ path: 'file.txt', index: 'M', working_dir: 'M' }],
//             ahead: 0,
//             behind: 0,
//             current: 'tests',
//             tracking: 'origin/tests',
//             detached: false,
//             isClean: () => false
//         });
//         console.log('[GitService Tests] Set up git status with modified file');
        
//         const result = await gitService.hasChanges();
//         console.log('[GitService Tests] hasChanges result:', result);
        
//         sinon.assert.calledOnce(gitStub.status);
//         assert.strictEqual(result, true);
//         console.log('[GitService Tests] Verified modified files detection');
//     });

//     test('hasChanges detects new files', async () => {
//         console.log('[GitService Tests] Testing hasChanges() with new files');
//         fsModule.existsSync.returns(true);
//         gitStub.status.resolves({
//             modified: [],
//             not_added: ['newfile.txt'],
//             deleted: [],
//             created: [],
//             renamed: [],
//             conflicted: [],
//             staged: [],
//             files: [{ path: 'newfile.txt', index: '?', working_dir: '?' }],
//             ahead: 0,
//             behind: 0,
//             current: 'tests',
//             tracking: 'origin/tests',
//             detached: false,
//             isClean: () => false
//         });
//         console.log('[GitService Tests] Set up git status with new file');
        
//         const result = await gitService.hasChanges();
//         console.log('[GitService Tests] hasChanges() returned:', result);
        
//         sinon.assert.calledOnce(gitStub.status);
//         assert.strictEqual(result, true);
//         console.log('[GitService Tests] Verified new files detection');
//     });

//     test('hasChanges detects deleted files', async () => {
//         console.log('[GitService Tests] Testing hasChanges() with deleted files');
//         fsModule.existsSync.returns(true);
//         gitStub.status.resolves({
//             modified: [],
//             not_added: [],
//             deleted: ['deleted.txt'],
//             created: [],
//             renamed: [],
//             conflicted: [],
//             staged: [],
//             files: [{ path: 'deleted.txt', index: 'D', working_dir: 'D' }],
//             ahead: 0,
//             behind: 0,
//             current: 'tests',
//             tracking: 'origin/tests',
//             detached: false,
//             isClean: () => false
//         });
//         console.log('[GitService Tests] Set up git status with deleted file');
        
//         const result = await gitService.hasChanges();
//         console.log('[GitService Tests] hasChanges() returned:', result);
        
//         sinon.assert.calledOnce(gitStub.status);
//         assert.strictEqual(result, true);
//         console.log('[GitService Tests] Verified deleted files detection');
//     });

//     test('push commits and pushes changes', async function() {
//         this.timeout(5000); // Increase timeout to 5 seconds
//         console.log('[GitService Tests] Testing push()');
//         fsModule.existsSync.returns(true);
//         gitStub.status.resolves({
//             modified: ['file.txt'],
//             not_added: [],
//             deleted: [],
//             created: [],
//             renamed: [],
//             conflicted: [],
//             staged: [],
//             files: [{ path: 'file.txt', index: 'M', working_dir: 'M' }],
//             ahead: 0,
//             behind: 0,
//             current: 'tests',
//             tracking: 'origin/tests',
//             detached: false,
//             isClean: () => false
//         });
//         console.log('[GitService Tests] Set up git status with modified file');
        
//         await gitService.push();
//         console.log('[GitService Tests] Called push()');
        
//         sinon.assert.calledOnce(gitStub.add);
//         sinon.assert.calledWith(gitStub.add, '.');
//         sinon.assert.calledOnce(gitStub.commit);
//         sinon.assert.calledWith(gitStub.commit, 'Sync VS Code settings');
//         sinon.assert.calledOnce(gitStub.push);
//         console.log('[GitService Tests] Verified git operations');
//     });

//     test('pull fetches and merges changes', async function() {
//         this.timeout(5000); // Increase timeout to 5 seconds
//         console.log('[GitService Tests] Testing pull()');
//         fsModule.existsSync.returns(true);
        
//         await gitService.pull();
//         console.log('[GitService Tests] Called pull()');
        
//         sinon.assert.calledOnce(gitStub.fetch);
//         sinon.assert.calledOnce(gitStub.pull);
//         console.log('[GitService Tests] Verified git operations');
//     });

//     test('forcePull resets and pulls changes', async () => {
//         console.log('[GitService Tests] Testing forcePull()');
//         await gitService.forcePull();
//         console.log('[GitService Tests] Called forcePull()');
        
//         sinon.assert.calledOnce(gitStub.fetch);
//         sinon.assert.calledOnce(gitStub.reset);
//         console.log('[GitService Tests] Verified forcePull() behavior');
//     });

//     test('forcePush force pushes changes', async () => {
//         console.log('[GitService Tests] Testing forcePush()');
//         gitStub.status.resolves(createStatusResult({
//             modified: ['file1.txt'],
//             isClean: () => false
//         }));
//         console.log('[GitService Tests] Set up git status with modified file');
        
//         await gitService.forcePush();
//         console.log('[GitService Tests] Called forcePush()');
        
//         sinon.assert.calledOnce(gitStub.add);
//         sinon.assert.calledOnce(gitStub.commit);
//         sinon.assert.calledOnce(gitStub.push);
//         sinon.assert.calledWithMatch(gitStub.push, sinon.match((args: any) => 
//             Array.isArray(args) && args[0] === '-f'
//         ));
//         console.log('[GitService Tests] Verified forcePush() behavior');
//     });

//     test('reinitialize cleans and reinitializes repository', async () => {
//         console.log('[GitService Tests] Testing reinitialize()');
//         fsModule.existsSync.returns(true);
//         console.log('[GitService Tests] Set existsSync to return true');
        
//         await gitService.reinitialize();
//         console.log('[GitService Tests] Called reinitialize()');
        
//         sinon.assert.calledOnce(fsModule.promises.rm);
//         sinon.assert.calledOnce(gitStub.init);
//         sinon.assert.calledWith(gitStub.addRemote, 'origin', 'https://github.com/YoraiLevi/settings-test');
//         console.log('[GitService Tests] Verified reinitialize() behavior');
//     });
// }); 