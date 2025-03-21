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
   * Check if a file exists in the workspace
   * 
   * @param filePath Path to file (relative to workspace)
   * @returns True if the file exists, false otherwise
   */
  async fileExists(filePath: string): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return false;
    }
    
    const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
    
    try {
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Write content to a file only if it exists
   * 
   * @param filePath Path to file (relative to workspace)
   * @param content Content to write to the file
   * @returns True if file exists and write was successful, false otherwise
   */
  async writeToExistingFile(filePath: string, content: string): Promise<boolean> {
    // Check if file exists first
    const exists = await this.fileExists(filePath);
    if (!exists) {
      console.error(`Cannot write to non-existent file: ${filePath}`);
      return false;
    }
    
    // Write content to the file
    return await this.writeFileContent(filePath, content);
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

  /**
   * Create a new file with the given content
   * 
   * @param filePath Path to file (relative to workspace)
   * @param content Content to write to the file
   * @returns True if successful, false otherwise
   * @throws Error if the file already exists
   */
  async createNewFile(filePath: string, content: string): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }
    
    // Check if file already exists
    const exists = await this.fileExists(filePath);
    if (exists) {
      throw new Error(`File already exists: ${filePath}`);
    }
    
    // Create the file with content
    const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
    console.log(`Creating new file ${filePath} using vscode api`);
    console.log(`File URI: ${fileUri}`);
    
    try {
      // Ensure directory exists
      const dirPath = vscode.Uri.joinPath(fileUri, '..');
      await vscode.workspace.fs.createDirectory(dirPath);
      
      // Write content to the file
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(content);
      await vscode.workspace.fs.writeFile(fileUri, uint8Array);
      return true;
    } catch (error) {
      console.error(`Error creating file ${filePath}:`, error);
      throw new Error(`Failed to create file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List contents of a directory
   * 
   * @param dirPath Path to directory (relative to workspace)
   * @returns Array of objects containing path and type (file or folder)
   * @throws Error if the directory does not exist or is not a directory
   */
  async listDirectoryContents(dirPath: string): Promise<Array<{ path: string; type: 'file' | 'folder' }>> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }
    
    // If empty path, list workspace root
    if (!dirPath || dirPath === '.') {
      dirPath = '';
    }
    
    // Create URI for the directory
    const dirUri = vscode.Uri.joinPath(workspaceFolders[0].uri, dirPath);
    
    try {
      // First check if path exists
      const stat = await vscode.workspace.fs.stat(dirUri);
      
      // Verify it's a directory
      if (!(stat.type & vscode.FileType.Directory)) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }
      
      // Get directory contents
      const entries = await vscode.workspace.fs.readDirectory(dirUri);
      
      // Map entries to desired format
      return entries.map(([name, fileType]) => {
        const entryPath = dirPath ? `${dirPath}/${name}` : name;
        const type = fileType & vscode.FileType.Directory ? 'folder' : 'file';
        return {
          path: entryPath,
          type
        };
      });
    } catch (error) {
      console.error(`Error listing directory ${dirPath}:`, error);
      throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get content of multiple files and format them with filename and content
   * 
   * @param files Array of file paths (relative to workspace)
   * @returns Formatted string containing filename and content of each file
   */
  async getMultipleFilesContent(files: string[]): Promise<string> {
    let formattedContent = "";
    
    for (const file of files) {
      try {
        const content = await this.getFileContent(file);
        formattedContent += `${file}\n\`\`\`\n${content}\n\`\`\`\n\n`;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error reading file ${file}: ${errorMessage}`);
      }
    }
    
    return formattedContent;
  }

  async searchFilesByName(pattern: string, excludePattern?: string, maxResults?: number): Promise<string[]> {
    if (!pattern) {
      return [];
    }
    
    try {
      const files = await vscode.workspace.findFiles(pattern, excludePattern, maxResults);
      return files.map(file => vscode.workspace.asRelativePath(file));
    } catch (error) {
      console.error(`Error searching files with pattern ${pattern}:`, error);
      return [];
    }
  }
} 