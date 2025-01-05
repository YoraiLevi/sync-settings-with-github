import * as path from 'path';
import { getConfiguration } from './configuration';
const vscodeVariables = require('vscode-variables');
import * as vscode from 'vscode';
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
    console.log("[resolveVSCodeVariables] Resolved path: ", path, resolvedPath);
    if (resolvedPath.includes("${")) {
        throw new Error("Unresolved variables in path: " + path);
    }
    return resolvedPath;
}
