import fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';
import simpleGit, { SimpleGit } from 'simple-git';
import * as os from 'os';
// import * as sinon from "ts-sinon";
import * as sinon from 'sinon';
import { GitService, INITIAL_COMMIT_COMMIT_MESSAGE, UPDATE_SETTINGS_COMMIT_MESSAGE, FORCE_UPDATE_SETTINGS_COMMIT_MESSAGE } from '../gitService';
import { Configuration, getConfiguration } from '../utils/configuration';

import { createLogger, LogLevel } from '../utils/logUtils';
class GitConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GitConflictError';
    }
}

const log = createLogger({
    serviceName: 'GitService-Test',
    minLevel: LogLevel.DEBUG
});

describe('GitService Tests', function () {

    async function initRepo(path: string, branch: string, bare: boolean = true) {
        log.debug('Initializing repository at', path);
        fs.mkdirSync(path, { recursive: true });
        let repo = simpleGit(path);
        if (bare) {
            await repo.init(['--bare', '-b', branch]);
        } else {
            await repo.init(['-b', branch]);
        }
        return repo;
    }
    async function deleteRepo(path: string) {
        log.debug('Deleting repository at', path);
        fs.rmSync(path, { recursive: true, force: true });
    }
    async function addCommit(repo: SimpleGit, message: string) {
        await repo.commit(message, ['--allow-empty']);
        return repo;
    }
    const date = new Date().getTime();
    let remoteRepoUrl = vscode.Uri.file(path.join(os.tmpdir(), 'vscode-extension-test', `${date}-remote-repo`)).fsPath;
    let localRepoUrl = vscode.Uri.file(path.join(os.tmpdir(), 'vscode-extension-test', `${date}-local-repo`)).fsPath;
    let branch = 'main';
    let config: Configuration;
    let remoteRepo: SimpleGit;
    let gitService: GitService;
    function setupTeardownConfigurationMock(remoteRepoUrl: string, localRepoUrl: string, branch: string) {
        before(async function () {
            // mock the configuration
            config = sinon.createStubInstance(Configuration);
            sinon.replace(Configuration, 'instance', config);
            sinon.replace(config, 'getRepositoryUrl', () => remoteRepoUrl);
            sinon.replace(config, 'getRepositoryPath', () => vscode.Uri.file(localRepoUrl));
            sinon.replace(config, 'getRepositoryBranch', () => branch);
        });
        after(async function () {
            sinon.restore();
        });
    }
    interface setupTeardownRemoteRepoOptions {
        remoteRepoUrl: string;
        branch: string;
        setupCommand?: (remoteRepo: SimpleGit) => Promise<void>;
        teardownCommand?: (remoteRepo: SimpleGit) => Promise<void>;
    }

    function setupTeardownRemoteRepo({
        remoteRepoUrl,
        branch,
        setupCommand,
        teardownCommand = async (remoteRepo: SimpleGit) => { await deleteRepo(remoteRepoUrl); }
    }: setupTeardownRemoteRepoOptions) {
        let _prevRemoteRepo: SimpleGit;
        before(async function () {
            _prevRemoteRepo = remoteRepo;
            remoteRepo = await initRepo(remoteRepoUrl, branch);
            if (setupCommand) {
                await setupCommand(remoteRepo);
            }
        });
        after(async function () {
            if (teardownCommand) {
                await teardownCommand(remoteRepo);
            }
            remoteRepo = _prevRemoteRepo;
        });
    }
    interface setupTeardownGitServiceOptions {
        setupCommand?: (gitService: GitService) => Promise<void>;
        teardownCommand?: (gitService: GitService) => Promise<void>;
    }

    function setupTeardownGitService({
        setupCommand = async (gitService: GitService) => { await gitService.ensureInitialized(); },
        teardownCommand = async (gitService: GitService) => { await deleteRepo(gitService.gitDirectory); }
    }: setupTeardownGitServiceOptions) {
        let _prevGitService: GitService;
        before(async function () {
            _prevGitService = gitService;
            gitService = new GitService();
            if (setupCommand) {
                await setupCommand(gitService);
            }
        });
        after(async function () {
            if (teardownCommand) {
                await teardownCommand(gitService);
            }
            gitService = _prevGitService;
        });
    }

    function itCheckCommitMessages({ itPrefix = 'repository', messages = [], getRepo }: { itPrefix: string, messages?: Array<string>; getRepo: () => SimpleGit }) {
        if (messages.length === 0) {
            it(`${itPrefix} has no commits`, async function () {
                return getRepo().log().should.eventually.be.rejectedWith('does not have any commits yet');
            });
        } else {
            it(`${itPrefix} has ${messages.length} commit(s)`, async function () {
                return Promise.all([
                    getRepo().log().should.eventually.be.fulfilled.with.property('total', messages.length),
                    getRepo().log().should.eventually.be.fulfilled.with.property('latest')
                        .with.property('message', messages[messages.length - 1]),
                ]);
            });
        }
    }


    describe('if configuration mocking works', function () {
        setupTeardownConfigurationMock(remoteRepoUrl, localRepoUrl, branch);
        it('should get the repository url', async function () {
            expect(getConfiguration().getRepositoryUrl()).to.equal(remoteRepoUrl);
        });
        it('should get the repository storage path', async function () {
            expect(getConfiguration().getRepositoryPath().fsPath).to.equal(localRepoUrl);
        });
        it('should get the configured repository branch', async function () {
            expect(getConfiguration().getRepositoryBranch()).to.equal(branch);
        });
    });
    describe('Tests for initializing the git service', function () {
        setupTeardownConfigurationMock(remoteRepoUrl, localRepoUrl, branch);
        describe('in case the remote repository has no commits on branch', function () {
            //  {#001}
            describe('in case of first initialization ever', function () {
                before(async function () {
                    // sanity check: remove the remote and local repositories
                    await deleteRepo(localRepoUrl);
                    await deleteRepo(remoteRepoUrl);
                });
                setupTeardownRemoteRepo({ remoteRepoUrl: remoteRepoUrl, branch: branch });
                describe('sanity check', function () {
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo });
                });
                describe('after initializing the git service', function () {
                    setupTeardownGitService({});
                    it('the git service should be initialized', async function () {
                        expect(gitService.isInitialized).to.be.true;
                    });
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [INITIAL_COMMIT_COMMIT_MESSAGE] });
                });
            });

            // {#002}
            describe('in case the local directory already exists but is empty', function () {
                before(async function () {
                    // sanity check: remove the remote and local repositories
                    await deleteRepo(localRepoUrl);
                    await deleteRepo(remoteRepoUrl);
                });
                setupTeardownRemoteRepo({ remoteRepoUrl: remoteRepoUrl, branch: branch });
                describe('sanity check', function () {
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo });
                });
                describe('after initializing the git service', function () {
                    setupTeardownGitService({
                        setupCommand: async (gitService: GitService) => {
                            fs.mkdirSync(gitService.gitDirectory, { recursive: true });
                            await gitService.ensureInitialized();
                        }
                    });
                    it('the git service should be initialized', async function () {
                        expect(gitService.isInitialized).to.be.true;
                    });
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [INITIAL_COMMIT_COMMIT_MESSAGE] });
                });
            });

            // {#003}
            describe('in case the local repository already exists but doesnt have commits', function () {
                setupTeardownRemoteRepo({ remoteRepoUrl: remoteRepoUrl, branch: branch });
                describe('sanity check', function () {
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo });
                });
                describe('after initializing the git repo', function () {
                    let localRepo: SimpleGit;
                    setupTeardownGitService({
                        setupCommand: async (gitService: GitService) => {
                            let localRepoUrl = gitService.gitDirectory;
                            localRepo = await initRepo(localRepoUrl, branch, false);
                        }
                    });
                    describe('sanity check', function () {
                        itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo });
                        it('git service is not initialized', async function () {
                            expect(gitService.isInitialized).to.be.false;
                        });
                        itCheckCommitMessages({ itPrefix: 'local repository', getRepo: () => localRepo });
                    });
                    describe('after initializing the git service', function () {
                        before(async function () {
                            await gitService.ensureInitialized();
                        });
                        it('the git service should be initialized', async function () {
                            expect(gitService.isInitialized).to.be.true;
                        });
                        itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [INITIAL_COMMIT_COMMIT_MESSAGE] });
                    });
                });
            });

            // {#004}
            describe('in case the local repository has commits', function () {
                setupTeardownRemoteRepo({ remoteRepoUrl: remoteRepoUrl, branch: branch });
                describe('sanity check', function () {
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo });
                });
                describe('after initializing the git repo', function () {
                    let localRepo: SimpleGit;
                    setupTeardownGitService({
                        setupCommand: async (gitService: GitService) => {
                            let localRepoUrl = gitService.gitDirectory;
                            localRepo = await initRepo(localRepoUrl, branch, false);
                            await addCommit(localRepo, 'A pre-existing commit on the local repo');
                        }
                    });
                    describe('sanity check', function () {
                        itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo });
                        itCheckCommitMessages({ itPrefix: 'local repository', getRepo: () => localRepo, messages: ['A pre-existing commit on the local repo'] });
                    });
                    describe('after initializing the git service', function () {
                        before(async function () {
                            await gitService.ensureInitialized();
                        });
                        it('the git service should be initialized', async function () {
                            expect(gitService.isInitialized).to.be.true;
                        });
                        itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: ['A pre-existing commit on the local repo'] });
                    });
                });
            });

        });
        describe('when remote repository has commits on branch', function () {
            let externalRepoUrl = path.join(os.tmpdir(), 'vscode-extension-test', `${date}-external-repo`);
            const REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE = 'A commit on the remote repo';
            function _setupTeardownRemoteRepo({
                setupCommand = async (remoteRepo: SimpleGit) => {
                    let externalRepo = await initRepo(externalRepoUrl, branch, false);
                    await externalRepo.removeRemote('origin').catch(() => { });
                    await externalRepo.addRemote('origin', remoteRepoUrl);
                    await addCommit(externalRepo, REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE);
                    await externalRepo.push(['--set-upstream', 'origin', branch]);
                },
                teardownCommand = async (remoteRepo: SimpleGit) => {
                    await deleteRepo(externalRepoUrl);
                    await deleteRepo(remoteRepoUrl);
                },
            }: setupTeardownRemoteRepoOptions) {
                setupTeardownRemoteRepo({
                    remoteRepoUrl: remoteRepoUrl, branch: branch,
                    setupCommand: setupCommand,
                    teardownCommand: teardownCommand,
                });
            }

            //  {#001}
            describe('in case of first initialization ever', function () {
                before(async function () {
                    // sanity check: remove the remote and local repositories
                    await deleteRepo(localRepoUrl);
                    await deleteRepo(remoteRepoUrl);
                });
                _setupTeardownRemoteRepo({ remoteRepoUrl: remoteRepoUrl, branch: branch });
                describe('sanity check', function () {
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE] });
                });
                describe('after initializing the git service', function () {
                    setupTeardownGitService({});
                    it('the git service should be initialized', async function () {
                        expect(gitService.isInitialized).to.be.true;
                    });
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE] });
                });
            });

            // {#002}
            describe('in case the local directory already exists but is empty', function () {
                before(async function () {
                    // sanity check: remove the remote and local repositories
                    await deleteRepo(localRepoUrl);
                    await deleteRepo(remoteRepoUrl);
                });
                _setupTeardownRemoteRepo({ remoteRepoUrl: remoteRepoUrl, branch: branch });
                describe('sanity check', function () {
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE] });
                });
                describe('after initializing the git service', function () {
                    setupTeardownGitService({
                        setupCommand: async (gitService: GitService) => {
                            fs.mkdirSync(gitService.gitDirectory, { recursive: true });
                            await gitService.ensureInitialized();
                        }
                    });
                    it('the git service should be initialized', async function () {
                        expect(gitService.isInitialized).to.be.true;
                    });
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE] });
                });
            });

            // {#003}
            describe('in case the local repository already exists but doesnt have commits', function () {
                _setupTeardownRemoteRepo({ remoteRepoUrl: remoteRepoUrl, branch: branch });
                describe('sanity check', function () {
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE] });
                });
                describe('after initializing the git repo', function () {
                    let localRepo: SimpleGit;
                    setupTeardownGitService({
                        setupCommand: async (gitService: GitService) => {
                            let localRepoUrl = gitService.gitDirectory;
                            localRepo = await initRepo(localRepoUrl, branch, false);
                        }
                    });
                    describe('sanity check', function () {
                        itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE] });
                        it('git service is not initialized', async function () {
                            expect(gitService.isInitialized).to.be.false;
                        });
                        itCheckCommitMessages({ itPrefix: 'local repository', getRepo: () => localRepo });
                    });
                    describe('after initializing the git service', function () {
                        before(async function () {
                            await gitService.ensureInitialized();
                        });
                        it('the git service should be initialized', async function () {
                            expect(gitService.isInitialized).to.be.true;
                        });

                        itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE] });
                    });
                });
            });

            // {#004}
            describe('in case the local repository has commits', function () {
                _setupTeardownRemoteRepo({ remoteRepoUrl: remoteRepoUrl, branch: branch });
                describe('sanity check', function () {
                    itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE] });
                });
                describe('after initializing the git repo', function () {
                    let localRepo: SimpleGit;
                    const LOCAL_REPO_PREEXISTING_COMMIT_MESSAGE = 'A pre-existing commit on the local repo';
                    setupTeardownGitService({
                        setupCommand: async (gitService: GitService) => {
                            let localRepoUrl = gitService.gitDirectory;
                            localRepo = await initRepo(localRepoUrl, branch, false);
                            await addCommit(localRepo, LOCAL_REPO_PREEXISTING_COMMIT_MESSAGE);
                        }
                    });
                    describe('sanity check', function () {
                        itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE] });
                        itCheckCommitMessages({ itPrefix: 'local repository', getRepo: () => localRepo, messages: [LOCAL_REPO_PREEXISTING_COMMIT_MESSAGE] });
                    });
                    describe('after initializing the git service', function () {
                        before(async function () {
                            await gitService.ensureInitialized();
                        });
                        it('the git service should be initialized', async function () {
                            expect(gitService.isInitialized).to.be.true;
                        });
                        itCheckCommitMessages({ itPrefix: 'remote repository', getRepo: () => remoteRepo, messages: [REMOTE_REPO_PREEXISTING_COMMIT_MESSAGE, LOCAL_REPO_PREEXISTING_COMMIT_MESSAGE] });
                    });
                });
            });











            // describe('when first local initialization', function () {
            // });
            // describe('when local repository already exists', function () {
            // });
            // describe('when local repository has commits', function () {
            //     describe('remote and local are the same', function () {
            //     });
            //     describe('remote and local are different', function () {
            //         describe('remote has commits local is missing', function () {
            //             describe('no conflicts', function () {
            //             });
            //             describe('conflicts', function () {
            //                 describe('automatic resolution', function () {
            //                 });
            //                 describe('manual resolution', function () {
            //                 });
            //             });
            //         });
            //         describe('local has commits remote is missing', function () {
            //             describe('no conflicts', function () {
            //             });
            //             describe('conflicts', function () {
            //                 describe('automatic resolution', function () {
            //                 });
            //                 describe('manual resolution', function () {
            //                 });
            //             });
            //         });
            //     });
            // });
        });
    });
});
describe('Tests for push functionality', function () {
});
describe('Tests for pull functionality', function () {
});
// describe('Push Funcionality', function () {
//     describe('the configuration', function () {
//
//     });
//     it('should create a git service', async function () {
//         expect(remoteRepo.log).to.throw();

//         expect(fs.existsSync(localRepoUrl)).to.be.false;
//         const gitService = new GitService();
//         await gitService.ensureInitialized();
//         expect(gitService.isInitialized).to.be.true;
//         expect(gitService.gitDirectory).to.equal(localRepoUrl);
//         expect(fs.existsSync(localRepoUrl)).to.be.true;
//         expect(fs.existsSync(path.join(localRepoUrl, '.git'))).to.be.true;
//         await gitService.push();
//         // should().not.Throw(remoteRepo.log);
//         expect((await remoteRepo.log()).total).to.equal(1);
//     });
//     describe('When the remote repository is already has commits in the branch', function () {
//         before(async function () {
//             await remoteRepo.commit('A commit on the remote repo', ['--allow-empty']);
//         });
//         let gitService: GitService;
//         describe('aa', function () {
//             it('should fail', function () {
//                 expect(true).to.be.false;
//             });
//         });
//         it('shold pass', function () {
//             expect(true).to.be.true;
//         });
//         describe('bb', function () {
//             before(async function () {
//                 gitService = new GitService();
//                 await gitService.ensureInitialized();
//             });
//             it('should display the branch in the remote repository', async function () {
//                 expect((await remoteRepo.branchLocal()).current).to.equal(branch);
//             });
//             it('git service should be initialized', async function () {
//                 expect(gitService.isInitialized).to.be.true;
//             });
//             it('The remote repository should have a commit', async function () {
//                 expect((await remoteRepo.log()).total).to.equal(1);
//             });
//         });
//         // });
// });
// });
// });
