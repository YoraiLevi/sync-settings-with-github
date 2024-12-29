# VS Code Settings Sync with GitHub

Synchronize your VS Code settings, keybindings, snippets, and shell configuration files using GitHub. This extension provides a seamless way to keep your development environment consistent across multiple machines.

## Features

- 🔄 **Automatic Synchronization**: Keep your settings in sync automatically
- 🐚 **Shell Config Support**: Sync your shell configuration files (.bashrc, .zshrc, etc.)
- 🎨 **VS Code Settings**: Sync settings.json, keybindings.json, and snippets
- 🧩 **Extension Sync**: Keep your VS Code extensions synchronized
- 🔒 **Git-based**: Uses Git for version control and conflict resolution
- ⚡ **Smart Sync**: Debounced file watching to prevent excessive syncs
- 🛠️ **Configurable**: Extensive configuration options for customization

## Installation

1. Open VS Code
2. Press `Ctrl+P` (Windows/Linux) or `Cmd+P` (macOS)
3. Type `ext install sync-settings-with-github`
4. Press Enter

## Setup

1. Create a GitHub repository for your settings
2. Open VS Code settings (`Ctrl+,` or `Cmd+,`)
3. Search for "Settings Sync"
4. Set your GitHub repository URL in `settingsSync.git.repositoryUrl`
5. Run the "Initialize Settings Sync" command from the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)

## Commands

- **Initialize Settings Sync**: Set up initial synchronization
- **Force Push Settings**: Override remote settings with local ones
- **Force Pull Settings**: Override local settings with remote ones
- **Sync Settings**: Perform a two-way sync
- **Toggle Settings Sync**: Enable/disable automatic sync
- **Open Settings Repository**: Open the local Git repository
- **Reinitialize Settings Repository**: Reset and reinitialize the repository

## Configuration

### Git Settings
\`\`\`json
{
    "settingsSync.git.repositoryUrl": "",
    "settingsSync.git.branch": "main",
    "settingsSync.git.pullBeforePush": true,
    "settingsSync.git.pullBeforeForcePush": false
}
\`\`\`

### Sync Settings
\`\`\`json
{
    "settingsSync.syncInterval": 300,
    "settingsSync.autoSync": true,
    "settingsSync.pullOnLaunch": true,
    "settingsSync.debounceDelay": 5
}
\`\`\`

### File Patterns
\`\`\`json
{
    "settingsSync.files": {
        "patterns": [
            "settings.json",
            "keybindings.json",
            "snippets/**/*.code-snippets",
            "globalStorage/storage.json"
        ],
        "excludePatterns": [],
        "externalFiles": [
            {
                "source": "~/.bashrc",
                "target": "shell/bashrc"
            },
            {
                "source": "~/.zshrc",
                "target": "shell/zshrc"
            }
        ]
    }
}
\`\`\`

### Extension Sync
\`\`\`json
{
    "settingsSync.extensions.sync": true,
    "settingsSync.extensions.autoRemove": false
}
\`\`\`

## Usage Examples

### Basic Setup
1. Create a GitHub repository for your settings
2. Configure the repository URL:
   ```json
   {
       "settingsSync.git.repositoryUrl": "https://github.com/username/vscode-settings.git"
   }
   ```
3. Run "Initialize Settings Sync"
4. Your settings will start syncing automatically

### Adding Shell Config Files
Add shell configuration files to sync:
```json
{
    "settingsSync.files.externalFiles": [
        {
            "source": "~/.bashrc",
            "target": "shell/bashrc"
        },
        {
            "source": "~/.zshrc",
            "target": "shell/zshrc"
        },
        {
            "source": "~/.config/fish/config.fish",
            "target": "shell/fish/config.fish"
        }
    ]
}
```

### Custom File Patterns
Add custom files or folders to sync:
```json
{
    "settingsSync.files.patterns": [
        "settings.json",
        "keybindings.json",
        "snippets/**/*.code-snippets",
        "globalStorage/storage.json",
        "custom-folder/**/*"
    ]
}
```

## Troubleshooting

### Push Conflicts
If you encounter push conflicts:
1. Use "Open Settings Repository" to view the local repository
2. Resolve conflicts manually
3. Use "Force Push" or "Force Pull" as needed

### Sync Issues
If synchronization isn't working:
1. Check your Git repository URL
2. Ensure you have proper Git credentials
3. Check the VS Code output panel for detailed logs
4. Try reinitializing the repository

### Missing Files
If files aren't syncing:
1. Verify file patterns in settings
2. Check file permissions
3. Ensure external files exist at specified paths
4. Check the VS Code output panel for file-related logs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Publishing

This extension is automatically published to the VS Code Marketplace when a new tag is pushed to the repository. To publish a new version:

1. Update the version in `package.json`
2. Create and push a new tag:
   ```bash
   git tag v1.0.0  # Use appropriate version
   git push origin v1.0.0
   ```
3. The GitHub Action will automatically:
   - Build and test the extension
   - Create a VSIX package
   - Publish to the VS Code Marketplace
   - Create a GitHub release

### Required Secrets

The following secrets need to be set in your GitHub repository:

- `VSCE_PAT`: Personal Access Token for publishing to the VS Code Marketplace
  - Generate from [Azure DevOps](https://dev.azure.com)
  - Needs "Marketplace > Manage" permission

## License

MIT License - see LICENSE file for details
