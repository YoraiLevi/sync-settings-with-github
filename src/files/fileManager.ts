import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import fg from 'fast-glob';

function log(message: string, ...args: any[]) {
    console.log(`[FileManager] ${message}`, ...args);
}

type GlobFunction = (patterns: string[], options: fg.Options) => Promise<string[]>;

// export class FileManager {
//     private workingDir: string;
//     private fs: typeof fs;
//     private glob: GlobFunction;

//     constructor(workingDir: string, fsModule: typeof fs = fs, globFunction: GlobFunction = fg) {
//         this.workingDir = workingDir;
//         this.fs = fsModule;
//         this.glob = globFunction;
//     }

//     getUserSettingsPath(): string {
//         // Get the product name (Code or Cursor)
//         const productName = vscode.env.appName === 'Cursor' ? 'Cursor' : 'Code';
        
//         // Get the actual user settings directory based on platform and product
//         const userSettingsPath = process.platform === 'win32'
//             ? path.join(process.env.APPDATA || '', productName, 'User')
//             : process.platform === 'darwin'
//                 ? path.join(process.env.HOME || '', 'Library', 'Application Support', productName, 'User')
//                 : path.join(process.env.HOME || '', '.config', productName, 'User');

//         // Ensure the directory exists
//         if (!this.fs.existsSync(userSettingsPath)) {
//             log('Creating user settings directory');
//             this.fs.mkdirSync(userSettingsPath, { recursive: true });
//         }

//         log('User settings path:', userSettingsPath);
//         return userSettingsPath;
//     }

//     async findFilesToSync(basePath: string): Promise<string[]> {
//         const config = vscode.workspace.getConfiguration('sync-settings-with-github');
//         const patterns = config.get<string[]>('patterns') || [];
//         const excludePatterns = config.get<string[]>('excludePatterns') || [];
        
//         return this.glob(patterns, {
//             ignore: excludePatterns,
//             dot: true,
//             absolute: true,
//             cwd: basePath
//         });
//     }

//     async copyFile(source: string, target: string): Promise<void> {
//         try {
//             log('Copying file:', { source, target });
//             if (this.fs.existsSync(source)) {
//                 await this.fs.promises.mkdir(path.dirname(target), { recursive: true });
//                 await this.fs.promises.copyFile(source, target);
//                 log('File copied successfully');
//             } else {
//                 log('Source file does not exist:', source);
//             }
//         } catch (error) {
//             const errorMessage = `Failed to copy file ${source} to ${target}: ${error instanceof Error ? error.message : String(error)}`;
//             log('Error copying file:', errorMessage);
//             throw new Error(errorMessage);
//         }
//     }

//     async copyFilesToWorkingDir(): Promise<void> {
//         log('Copying files to working directory');
//         const userSettingsPath = this.getUserSettingsPath();
//         log('Paths:', { workingDir: this.workingDir, userSettingsPath });

//         const files = await this.findFilesToSync(userSettingsPath);
//         log('Found files to sync:', files);

//         for (const file of files) {
//             const relativePath = path.relative(userSettingsPath, file);
//             const targetPath = path.join(this.workingDir, relativePath);
//             await this.copyFile(file, targetPath);
//         }

//         log('File copying complete');
//     }

//     async copyFilesFromWorkingDir(): Promise<void> {
//         log('Copying files from working directory to VS Code settings');
//         const userSettingsPath = this.getUserSettingsPath();
//         log('Paths:', { workingDir: this.workingDir, userSettingsPath });

//         const files = await this.findFilesToSync(this.workingDir);
//         log('Found files to sync:', files);

//         for (const file of files) {
//             const relativePath = path.relative(this.workingDir, file);
//             const targetPath = path.join(userSettingsPath, relativePath);
//             await this.copyFile(file, targetPath);
//         }

//         log('File copying complete');
//     }
// } 