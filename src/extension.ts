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
import { GitService } from './agent/utils/git';

// Function to set LangSmith environment variables from configuration
function updateLangSmithEnvFromConfig() {
	const config = vscode.workspace.getConfiguration('durrsor');
	
	// Set LangSmith tracing flag - default to true
	const tracingEnabled = config.get<boolean>('langsmith.tracing');
	process.env.LANGSMITH_TRACING = tracingEnabled !== false ? "true" : "false";
	
	// Set LangSmith endpoint - use default if not specified
	const endpoint = config.get<string>('langsmith.endpoint');
	if (endpoint) {
		process.env.LANGSMITH_ENDPOINT = endpoint;
	} else {
		process.env.LANGSMITH_ENDPOINT = "https://api.smith.langchain.com";
	}

	// Set LangSmith API key - from configuration
	const apiKey = config.get<string>('langsmith.apiKey');
	if (apiKey) {
		process.env.LANGSMITH_API_KEY = apiKey;
	}
	
	// The project name remains constant
	process.env.LANGSMITH_PROJECT = "durrsor";
}

// WebView provider class for the sidebar panel
class DurrsorViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'durrsor.sidePanel';
	private _view?: vscode.WebviewView;
	private _agentService: AgentService;
	private _fileService: FileService;
	private _logService: LogService;
	private _previousState?: GraphStateType;
	private _updatedConfig?: any; // Store the updated config separately from state

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
			case 'restoreGitCheckpoint':
				await this._handleRestoreGitCheckpoint(message.commitHash);
				break;
			case 'openSettings':
				await vscode.commands.executeCommand('workbench.action.openSettings', 'durrsor');
				break;
			case 'acceptChanges':
				await this._handleAcceptChanges();
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
			
			// Get the thread ID from the previous state and use stored updated config
			const threadId = this._previousState?.thread_id;
			
			// Invoke agent
			const result = await this._agentService.processPrompt(
				prompt,
				selectedFiles,
				threadId,
				this._updatedConfig
			);
			
			// Dispose of event handlers
			messageHandler.dispose();
			chunkHandler.dispose();
			
			// Save state for next invocation
			this._previousState = result;
			
			// Clear the updatedConfig since it's been used
			this._updatedConfig = undefined;

			// If there's a commit hash in the result, send git checkpoint message
			if (result.commit_hash) {
				this._view?.webview.postMessage({
					command: 'gitCheckpoint',
					commitHash: result.commit_hash
				});
			}
			
			// Send a thread updated message to update the chat title only if the thread ID has changed
			// or if this is a new thread (previousThreadId is undefined)
			if (result.thread_id && result.thread_id !== threadId) {
				this._view?.webview.postMessage({
					command: 'threadUpdated',
					threadId: result.thread_id
				});
			}
			
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

	private async _handleRestoreGitCheckpoint(commitHash: string) {
		// Show loading indicator
		this._view?.webview.postMessage({ command: 'showLoading' });
		
		try {
			this._logService.internal(`Restoring git checkpoint to commit: ${commitHash}`);
			
			// Perform git hard reset to the specified commit using GitService
			const gitResult = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Resetting to checkpoint...",
					cancellable: false
				},
				async () => {
					return await GitService.resetToCommit(commitHash);
				}
			);
			
			this._logService.internal(gitResult);
			
			// Check if git reset was successful
			if (gitResult.startsWith('Error:')) {
				throw new Error(gitResult);
			}
			
			// Get current thread ID from previous state
			const threadId = this._previousState?.thread_id;
			if (!threadId) {
				throw new Error("No active thread ID found");
			}
			
			// Restore agent to the checkpoint associated with this commit
			const updatedConfig = await this._agentService.restoreToCheckpoint(commitHash, threadId);
			
			if (!updatedConfig) {
				throw new Error(`Failed to restore agent state for commit: ${commitHash}`);
			}
			
			// Store the updated config for next prompt
			this._updatedConfig = updatedConfig;
			this._logService.internal(`Stored updated config for next operation: ${JSON.stringify(updatedConfig)}`);
			
			// Get the restored state and set as previous state for next prompt
			const restoredState = await this._agentService.getState(threadId);
			if (restoredState) {
				this._previousState = restoredState;
				this._logService.internal(`Successfully restored previous state from checkpoint`);
			}
			
			// Notify the webview that restore is complete
			this._view?.webview.postMessage({ 
				command: 'checkpointRestored', 
				commitHash: commitHash,
				success: true 
			});
			
			// Hide loading indicator
			this._view?.webview.postMessage({ command: 'hideLoading' });
			
		} catch (error: any) {
			console.error('Error restoring checkpoint:', error);
			this._logService.error('extension', `Error restoring checkpoint: ${error.message || 'An unknown error occurred'}`);
			
			// Notify webview of failure
			this._view?.webview.postMessage({ 
				command: 'checkpointRestored', 
				commitHash: commitHash,
				success: false,
				error: error.message 
			});
			
			// Hide loading indicator
			this._view?.webview.postMessage({ command: 'hideLoading' });
		}
	}

	private async _handleAcceptChanges() {
		// Show loading indicator
		this._view?.webview.postMessage({ command: 'showLoading' });
		
		// Get threadId from previous state
		const threadId = this._previousState?.thread_id;
		
		try {
			if (!threadId) {
				throw new Error('No active thread ID found');
			}
			
			this._logService.internal(`Accepting changes for thread: ${threadId}`);
			
			// Perform the accept changes operation - will throw if it fails
			await this._agentService.acceptChanges(threadId);
			
			this._logService.internal(`Changes accepted successfully for thread: ${threadId}`);
			
			// Clear previous state and updated config to start fresh
			this._previousState = undefined;
			this._updatedConfig = undefined;
			
			this._view?.webview.postMessage({ 
				command: 'changesAccepted', 
				threadId: threadId || '',
				success: true 
			});
			
			// Hide loading indicator
			this._view?.webview.postMessage({ command: 'hideLoading' });
		} catch (error: any) {
			console.error('Error accepting changes:', error);
			this._logService.error('extension', `Error accepting changes: ${error.message || 'An unknown error occurred'}`);
			
			// Notify webview of failure
			this._view?.webview.postMessage({ 
				command: 'changesAccepted', 
				threadId: threadId || '',
				success: false,
				error: error.message 
			});
			
			// Hide loading indicator
			this._view?.webview.postMessage({ command: 'hideLoading' });
		}
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Durrsor extension is now active!');
	
	// Set LangSmith environment variables from configuration
	updateLangSmithEnvFromConfig();

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
				// Update LangSmith environment variables if the configuration changed
				if (event.affectsConfiguration('durrsor.langsmith')) {
					updateLangSmithEnvFromConfig();
				}
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
