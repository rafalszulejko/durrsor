// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// WebView provider class for the sidebar panel
class DurrsorViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'durrsor.sidePanel';

	constructor(private readonly _extensionUri: vscode.Uri) {}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		webviewView.webview.options = {
			// Enable scripts in the webview
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		// Set the HTML content
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Durrsor</title>
			<style>
				body {
					font-family: var(--vscode-font-family);
					color: var(--vscode-editor-foreground);
					padding: 16px;
					background-color: var(--vscode-editor-background);
				}
				h2 {
					margin-top: 0;
					color: var(--vscode-foreground);
				}
				.message {
					margin: 16px 0;
					padding: 12px;
					border-radius: 6px;
					background-color: var(--vscode-input-background);
					border-left: 4px solid var(--vscode-activityBarBadge-background);
				}
			</style>
		</head>
		<body>
			<h2>Durrsor</h2>
			<div class="message">
				<p>👋 Welcome to Durrsor! I'm here to help you with your coding tasks.</p>
			</div>
		</body>
		</html>`;
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "durrsor" is now active!');

	// Register the WebView provider for the side panel
	const durrsorViewProvider = new DurrsorViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			DurrsorViewProvider.viewType, 
			durrsorViewProvider
		)
	);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('durrsor.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from durrsor!');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
