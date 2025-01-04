import * as path from 'path';

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