import * as path from 'path';
import { FilePattern, getConfiguration } from './configuration';
const vscodeVariables = require('vscode-variables');
import * as vscode from 'vscode';
import fg from 'fast-glob';
import * as fs from 'fs';
import { createLogger, LogLevel } from './logUtils';

const log = createLogger({
    serviceName: 'PathUtils',
    minLevel: LogLevel.INFO
});

export function getVSCodeSettingsPath(platform: NodeJS.Platform): string {
    switch (platform) {
        case 'win32':
            return path.join(process.env.APPDATA || '', 'Code', 'User');
        case 'darwin':
            return path.join(process.env.HOME || '', 'Library', 'Application Support', 'Code', 'User');
        case 'linux':
            return path.join(process.env.HOME || '', '.config', 'Code', 'User');
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

export function resolveVSCodeVariables(path: string): string {
    // https://code.visualstudio.com/docs/editor/variables-reference
    path = path.replace("~", "${userHome}");
    let resolvedPath = vscodeVariables(path);
    resolvedPath = resolvedPath.replace(/\${userSettings}/g, getConfiguration().getUserSettingsPath().fsPath); // added ${userSettings} special variable
    resolvedPath = resolvedPath.replace(/\${globalStorage}/g, getConfiguration().getGlobalStoragePath().fsPath); // added ${globalStorage} special variable
    log.debug("Resolved path: ", path, resolvedPath);
    if (resolvedPath.includes("${")) {
        const error = "Unresolved variables in path: " + path;
        log.error(error);
        throw new Error(error);
    }
    return resolvedPath;
}

export function getFiles(filePattern: FilePattern, baseDir: string): Promise<string[]> {
    return fg(filePattern.patterns, {
        cwd: baseDir,
        absolute: true,
        ignore: filePattern.excludePatterns,
        onlyFiles: true,
        dot: true,
    });
}

export async function copyFile(source: string, target: string): Promise<void> {
    try {
        log.debug('Copying file:', { source, target });
        if (fs.existsSync(source)) {
            await fs.promises.mkdir(path.dirname(target), { recursive: true });
            await fs.promises.copyFile(source, target);
            log.debug('File copied successfully');
        } else {
            log.warn('Source file does not exist:', source);
        }
    } catch (error) {
        const errorMessage = `Failed to copy file ${source} to ${target}: ${error instanceof Error ? error.message : String(error)}`;
        log.error('Error copying file:', errorMessage);
        throw new Error(errorMessage);
    }
}