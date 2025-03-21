// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AgentService } from './services/agentService';
import { FileService } from './services/fileService';
import { GraphStateType } from './agent/graphState';
import { LogService } from './services/logService';
import { ToolMessage } from '@langchain/core/messages';
import { ModelService } from './services/modelService';
import { getLayout } from './webview/layout';

// WebView provider class for the sidebar panel
class DurrsorViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'durrsor.sidePanel';
	private _view?: vscode.WebviewView;
	private _agentService: AgentService;
	private _fileService: FileService;
	private _logService: LogService;
	private _previousState?: GraphStateType;

	constructor(private readonly _extensionUri: vscode.Uri) {
		this._logService = LogService.getInstance();
		this._agentService = new AgentService();
		this._fileService = new FileService();
		
		// Subscribe to log messages
		this._logService.onLogMessage(({ level, message, isNewType }) => {
			if (this._view) {
				this._view.webview.postMessage({
					command: 'log',
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
		
		// Send initial model information once the webview is loaded
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this._sendModelInfo();
			}
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get path to main script and stylesheet
		const scriptPath = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.js')
		);
		
		const stylePath = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'styles', 'main.css')
		);
		
		// Get path to codicons
		const codiconsPath = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
		);
		
		return getLayout(webview, getNonce(), stylePath, scriptPath, codiconsPath);
	}

	private async _handleMessage(message: any) {
		switch (message.command) {
			case 'sendPrompt':
				await this._handlePrompt(message.prompt, message.selectedFiles);
				break;
			case 'selectFiles':
				await this._handleFileSelection();
				break;
			case 'getModelInfo':
				this._sendModelInfo();
				break;
		}
	}

	private async _handlePrompt(prompt: string, selectedFiles: string[]) {
		// Show loading indicator
		this._view?.webview.postMessage({ command: 'showLoading' });
		
		try {
			// Set up event handlers for streaming
			const messageHandler = this._agentService.onMessageReceived((message) => {
				// Extract essential data from the message object to avoid serialization issues
				const messageData: {
					type: string;
					content: any;
					name?: string;
					additional_kwargs?: any;
					id?: string;
					tool_call_id?: string;
				} = {
					type: message._getType ? message._getType() : message.getType?.(),
					content: message.content,
					name: message.name,
					additional_kwargs: message.additional_kwargs,
					id: message.id
				};
				
				// Add tool_call_id for ToolMessage objects
				if (message instanceof ToolMessage) {
					messageData.tool_call_id = message.tool_call_id;
				}
				
				this._view?.webview.postMessage({
					command: 'message',
					messageData
				});
			});
			
			const chunkHandler = this._agentService.onMessageChunkReceived((chunk) => {
				this._view?.webview.postMessage({
					command: 'messageChunk',
					chunkData: {
						content: chunk.content,
						id: chunk.id
					}
				});
			});
			
			// Invoke agent
			const result = await this._agentService.processPrompt(
				prompt,
				selectedFiles,
				this._previousState?.thread_id
			);
			
			// Dispose of event handlers
			messageHandler.dispose();
			chunkHandler.dispose();
			
			// Save state for next invocation
			this._previousState = result;
			
			// Hide loading indicator
			this._view?.webview.postMessage({ command: 'hideLoading' });
		} catch (error: any) {
			console.error('Error invoking agent:', error);
			this._logService.error('extension', `Error: ${error.message || 'An unknown error occurred'}`);
			
			// Hide loading indicator
			this._view?.webview.postMessage({ command: 'hideLoading' });
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

	private _sendModelInfo() {
		const modelService = ModelService.getInstance();
		this._view?.webview.postMessage({
			command: 'modelInfo',
			smallModel: modelService.getSmallModelName(),
			bigModel: modelService.getBigModelName()
		});
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

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			// Check if our extension's configuration was changed
			if (event.affectsConfiguration('durrsor')) {
				// Refresh the model provider configuration
				ModelService.getInstance().refreshConfiguration();
				// Refresh the log service configuration
				LogService.getInstance().refreshConfiguration();
				console.log('Durrsor configuration refreshed');
			}
		})
	);
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
