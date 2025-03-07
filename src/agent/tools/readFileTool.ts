import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import * as vscode from 'vscode';
import { FileService } from '../../services/fileService';
import { LogService } from '../../services/logService';

/**
 * Interface for the output of the file reading operation
 */
interface ReadFileOutput {
  success: boolean;
  content: string;
  message: string;
  filePath: string;
}

/**
 * Read the contents of the specified file using VSCode API.
 * @param filePath Path to the file to be read (relative to workspace)
 * @param logService LogService instance for logging
 * @returns Result of the file reading operation
 */
async function readFile(filePath: string, logService: LogService): Promise<ReadFileOutput> {
  try {
    const fileService = new FileService();
    const content = await fileService.getFileContent(filePath);
    
    if (content === '') {
      logService.error('Read file', `File '${filePath}' does not exist or could not be read`);
      return {
        success: false,
        content: '',
        message: `File '${filePath}' does not exist or could not be read`,
        filePath
      };
    }
    
    return {
      success: true,
      content,
      message: 'Successfully read file contents',
      filePath
    };
  } catch (e) {
    const error = e as Error;
    logService.error('Read file', `Error reading file: ${error.message}`);
    return {
      success: false,
      content: '',
      message: `Error reading file: ${error.message}`,
      filePath
    };
  }
}

/**
 * Create a read file tool that reads contents from files.
 * This tool is designed to work within a VSCode extension context.
 * 
 * @param logService LogService instance for logging
 * @returns DynamicStructuredTool instance
 */
export function createReadFileTool(logService: LogService): DynamicStructuredTool<any> {
  return new DynamicStructuredTool({
    name: 'read_file_tool',
    description: 'Read contents from an existing file',
    schema: z.object({
      filePath: z.string().describe('Path to the file to be read')
    }),
    func: async ({ filePath }) => {
      try {
        logService.tool('Read file', `${filePath}`);
        const result = await readFile(filePath, logService);
        return JSON.stringify(result);
      } catch (e) {
        const error = e as Error;
        logService.error('Read file', `Error during read process: ${error.message}`);
        const result: ReadFileOutput = {
          success: false,
          content: '',
          message: `Error during read process: ${error.message}`,
          filePath
        };
        return JSON.stringify(result);
      }
    }
  });
}
