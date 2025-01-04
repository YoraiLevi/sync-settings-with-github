import * as assert from 'assert';
import * as path from 'path';
import { getVSCodeSettingsPath } from '../../utils/pathUtils';

suite('Path Pattern Tests', () => {
    let originalPlatform: string;
    let originalAppData: string | undefined;
    let originalHome: string | undefined;

    setup(() => {
        // Store original values
        originalPlatform = process.platform;
        originalAppData = process.env.APPDATA;
        originalHome = process.env.HOME;
    });

    teardown(() => {
        // Restore original values
        process.env.APPDATA = originalAppData;
        process.env.HOME = originalHome;
    });

    test('VS Code path patterns resolve correctly on each platform', () => {
        // Test Windows path
        process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
        delete process.env.HOME;
        let settingsPath = getVSCodeSettingsPath('win32');
        assert.strictEqual(settingsPath, path.join('C:\\Users\\test\\AppData\\Roaming', 'Code', 'User'));

        // Test macOS path
        process.env.HOME = '/Users/test';
        delete process.env.APPDATA;
        settingsPath = getVSCodeSettingsPath('darwin');
        assert.strictEqual(settingsPath, path.join('/Users/test/Library/Application Support/Code/User'));

        // Test Linux path
        process.env.HOME = '/home/test';
        delete process.env.APPDATA;
        settingsPath = getVSCodeSettingsPath('linux');
        assert.strictEqual(settingsPath, path.join('/home/test/.config/Code/User'));
    });
}); 