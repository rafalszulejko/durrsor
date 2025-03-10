import * as vscode from 'vscode';

export class FileService {
  /**
   * Open file picker dialog and return selected files
   * 
   * @returns Array of selected file paths (relative to workspace)
   */
  async selectFiles(): Promise<string[]> {
    const files = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Select Files',
      filters: { 'All Files': ['*'] }
    });
    
    if (!files) {
      return [];
    }
    
    return files.map(file => vscode.workspace.asRelativePath(file));
  }
  
  /**
   * Get file content
   * 
   * @param filePath Path to file (relative to workspace)
   * @returns File content as string
   */
  async getFileContent(filePath: string): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return '';
    }
    
    const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
    console.log(`Getting file content for ${filePath} using vscode api`);
    console.log(`File URI: ${fileUri}`);
    
    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      return document.getText();
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return '';
    }
  }
  
  /**
   * Write content to a file
   * 
   * @param filePath Path to file (relative to workspace)
   * @param content Content to write to the file
   * @returns True if successful, false otherwise
   */
  async writeFileContent(filePath: string, content: string): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return false;
    }
    
    const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
    console.log(`Writing content to file ${filePath} using vscode api`);
    console.log(`File URI: ${fileUri}`);
    
    try {
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(content);
      await vscode.workspace.fs.writeFile(fileUri, uint8Array);
      return true;
    } catch (error) {
      console.error(`Error writing to file ${filePath}:`, error);
      return false;
    }
  }
} 