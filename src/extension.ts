// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { AgentService } from './services/agentService';
import { FileService } from './services/fileService';
import { GraphStateType } from './agent/graphState';
import { LogService, LogLevel } from './services/logService';

// WebView provider class for the sidebar panel
class DurrsorViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'durrsor.sidePanel';
	private _view?: vscode.WebviewView;
	private _agentService: AgentService;
	private _fileService: FileService;
	private _logService: LogService;
	private _previousState?: GraphStateType;

	constructor(private readonly _extensionUri: vscode.Uri) {
		this._logService = new LogService();
		this._agentService = new AgentService(this._logService);
		this._fileService = new FileService();
		
		// Subscribe to log messages
		this._logService.onLogMessage(({ level, message, isNewType }) => {
			if (this._view) {
				this._view.webview.postMessage({
					command: 'logMessage',
					level,
					message,
					isNewType
				});
			}
		});
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;
		
		// Set up webview options
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};
		
		// Set up message handling
		webviewView.webview.onDidReceiveMessage(this._handleMessage.bind(this));
		
		// Load webview content
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get path to main script and stylesheet
		const scriptPath = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.js')
		);
		
		const stylePath = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'styles', 'main.css')
		);
		
		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();
		
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
			<title>Durrsor</title>
			<link rel="stylesheet" href="${stylePath}">
		</head>
		<body>
			<div class="chat-container" id="chatContainer"></div>
			
			<div class="input-container">
				<div class="file-selector" id="fileSelector">
					<button id="selectFilesButton">Select Files</button>
					<div id="selectedFiles" class="selected-files"></div>
				</div>
				
				<div class="input-box">
					<textarea id="promptInput" placeholder="Ask a question..."></textarea>
					<button id="sendButton">Send</button>
				</div>
			</div>
			
			<script nonce="${nonce}" src="${scriptPath}"></script>
		</body>
		</html>`;
	}

	private async _handleMessage(message: any) {
		switch (message.command) {
			case 'sendPrompt':
				await this._handlePrompt(message.prompt, message.selectedFiles);
				break;
			case 'selectFiles':
				await this._handleFileSelection();
				break;
		}
	}

	private async _handlePrompt(prompt: string, selectedFiles: string[]) {
		// Show loading indicator
		this._view?.webview.postMessage({ command: 'showLoading' });
		
		try {
			// Invoke agent
			const result = await this._agentService.invokeAgent(
				prompt,
				selectedFiles,
				this._previousState
			);
			
			// Save state for next invocation
			this._previousState = result;
			
			// Send response to webview
			this._view?.webview.postMessage({
				command: 'agentResponse',
				response: result.diff || 'No changes needed.',
				files: result.files_modified || []
			});
		} catch (error: any) {
			console.error('Error invoking agent:', error);
			this._view?.webview.postMessage({
				command: 'agentResponse',
				response: `Error: ${error.message || 'An unknown error occurred'}`,
				files: []
			});
		}
	}

	private async _handleFileSelection() {
		try {
			const files = await this._fileService.selectFiles();
			
			if (files && files.length > 0) {
				this._view?.webview.postMessage({
					command: 'selectedFiles',
					files: files
				});
			}
		} catch (error: any) {
			console.error('Error selecting files:', error);
			vscode.window.showErrorMessage('Error selecting files: ' + error.message);
		}
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Durrsor extension is now active!');

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

// Helper function to generate a nonce
function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
