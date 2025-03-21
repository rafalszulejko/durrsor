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
