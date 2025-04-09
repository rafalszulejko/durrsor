import * as vscode from 'vscode';

export function getLayout(webview: vscode.Webview, nonce: string, stylePath: vscode.Uri, scriptPath: vscode.Uri, codiconsUri: vscode.Uri) {
	return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
			<title>Durrsor</title>
			<link rel="stylesheet" href="${codiconsUri}">
			<link rel="stylesheet" href="${stylePath}">
		</head>
		<body>
			<div class="nav-container">
				<div class="nav-left">
					<button id="rejectButton" class="reject-button" style="display: none;">Reject</button>
					<button id="acceptButton" class="accept-button" style="display: none;">Accept</button>
				</div>
				<div class="nav-title" id="chatTitle">New chat</div>
				<div class="nav-right">
					<button id="settingsButton" class="icon-button">
						<span class="codicon codicon-settings-gear"></span>
					</button>
				</div>
			</div>
			
			<div class="chat-container" id="chatContainer"></div>
			
			<div class="input-container">
				<div class="file-selector" id="fileSelector">
					<div id="selectedFiles" class="selected-files"></div>
				</div>
				
				<div class="prompt-container">
					<textarea id="promptInput" placeholder="Ask a question..."></textarea>
					<div class="controls-panel">
						<button id="selectFilesButton" class="file-select-button">
							<span class="codicon codicon-add"></span>
						</button>
						<div id="modelInfo" class="model-info">
							<span id="smallModelName"></span> | <span id="bigModelName"></span>
						</div>
						<div id="sendButtonContainer"></div>
					</div>
				</div>
			</div>
			
			<script nonce="${nonce}" src="${scriptPath}"></script>
		</body>
		</html>`;
}
