import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import fg from 'fast-glob';
import { Configuration } from '../config/configuration';

function log(message: string, ...args: any[]) {
    console.log(`[FileManager] ${message}`, ...args);
}

export class FileManager {
    constructor(private workingDir: string) {}

    getUserSettingsPath(): string {
        // Get the product name (Code or Cursor)
        const productName = vscode.env.appName === 'Cursor' ? 'Cursor' : 'Code';
        
        // Get the actual user settings directory based on platform and product
        const userSettingsPath = process.platform === 'win32'
            ? path.join(process.env.APPDATA || '', productName, 'User')
            : process.platform === 'darwin'
                ? path.join(process.env.HOME || '', 'Library', 'Application Support', productName, 'User')
                : path.join(process.env.HOME || '', '.config', productName, 'User');

        // Ensure the directory exists
        if (!fs.existsSync(userSettingsPath)) {
            log('Creating user settings directory');
            fs.mkdirSync(userSettingsPath, { recursive: true });
        }

        log('User settings path:', userSettingsPath);
        return userSettingsPath;
    }

    async findFilesToSync(basePath: string): Promise<string[]> {
        const fileConfig = Configuration.getFilePatterns();
        return fg(fileConfig.patterns, {
            ignore: fileConfig.excludePatterns,
            dot: true,
            absolute: true,
            cwd: basePath
        });
    }

    async copyFile(source: string, target: string): Promise<void> {
        try {
            log('Copying file:', { source, target });
            if (fs.existsSync(source)) {
                await fs.promises.mkdir(path.dirname(target), { recursive: true });
                await fs.promises.copyFile(source, target);
                log('File copied successfully');
            } else {
                log('Source file does not exist:', source);
            }
        } catch (error) {
            const errorMessage = `Failed to copy file ${source} to ${target}: ${error instanceof Error ? error.message : String(error)}`;
            log('Error copying file:', errorMessage);
            throw new Error(errorMessage);
        }
    }

    async copyFilesToWorkingDir(): Promise<void> {
        log('Copying files to working directory');
        const userSettingsPath = this.getUserSettingsPath();
        log('Paths:', { workingDir: this.workingDir, userSettingsPath });

        const files = await this.findFilesToSync(userSettingsPath);
        log('Found files to sync:', files);

        for (const file of files) {
            const relativePath = path.relative(userSettingsPath, file);
            const targetPath = path.join(this.workingDir, relativePath);
            await this.copyFile(file, targetPath);
        }

        log('File copying complete');
    }

    async copyFilesFromWorkingDir(): Promise<void> {
        log('Copying files from working directory to VS Code settings');
        const userSettingsPath = this.getUserSettingsPath();
        log('Paths:', { workingDir: this.workingDir, userSettingsPath });

        const files = await this.findFilesToSync(this.workingDir);
        log('Found files to sync:', files);

        for (const file of files) {
            const relativePath = path.relative(this.workingDir, file);
            const targetPath = path.join(userSettingsPath, relativePath);
            await this.copyFile(file, targetPath);
        }

        log('File copying complete');
    }
} 