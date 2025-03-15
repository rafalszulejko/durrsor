import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import * as vscode from 'vscode';
import { FileService } from '../../services/fileService';
import { LogService } from '../../services/logService';

/**
 * Interface for the output of the file replacement operation
 */
interface ReplaceFileOutput {
  success: boolean;
  message: string;
  filePath: string;
}

/**
 * Replace the contents of the specified file with the provided content.
 * @param filePath Path to the file to be modified (relative to workspace)
 * @param content New content to replace the file with
 * @param logService LogService instance for logging
 * @returns Result of the file replacement operation
 */
async function replaceFile(filePath: string, content: string, logService: LogService): Promise<ReplaceFileOutput> {
  try {
    // Ensure workspace exists
    if (!vscode.workspace.workspaceFolders) {
      logService.error('Replace file', 'No workspace folder found');
      return {
        success: false,
        message: 'No workspace folder found',
        filePath
      };
    }
    
    const fileService = new FileService();
    
    // Use the FileService to write to the existing file
    const success = await fileService.writeToExistingFile(filePath, content);
    
    if (success) {
      return {
        success: true,
        message: 'Successfully replaced file contents',
        filePath
      };
    } else {
      logService.error('Replace file', `Failed to replace contents of file '${filePath}'. File may not exist.`);
      return {
        success: false,
        message: `Failed to replace contents of file '${filePath}'. File may not exist.`,
        filePath
      };
    }
  } catch (e) {
    const error = e as Error;
    logService.error('Replace file', `Error replacing file contents: ${error.message}`);
    return {
      success: false,
      message: `Error replacing file contents: ${error.message}`,
      filePath
    };
  }
}

/**
 * Create a replace file tool that replaces the entire contents of a file with provided content.
 * This tool is designed to work within a VSCode extension context.
 * 
 * @param logService LogService instance for logging
 * @returns DynamicStructuredTool instance
 */
export function createReplaceFileTool(logService: LogService): DynamicStructuredTool<any> {
  return new DynamicStructuredTool({
    name: 'replace_file_tool',
    description: 'Replace the entire contents of a file with provided content',
    schema: z.object({
      filePath: z.string().describe('Path to the file to be replaced'),
      content: z.string().describe('New content to replace the file with')
    }),
    func: async ({ filePath, content }) => {
      try {
        const result = await replaceFile(filePath, content, logService);
        return JSON.stringify(result);
      } catch (e) {
        const error = e as Error;
        logService.error('Replace file', `Error during replace process: ${error.message}`);
        const result: ReplaceFileOutput = {
          success: false,
          message: `Error during replace process: ${error.message}`,
          filePath
        };
        return JSON.stringify(result);
      }
    }
  });
} 