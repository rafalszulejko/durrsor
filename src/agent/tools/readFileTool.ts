import * as fs from 'fs';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

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
 * Read the contents of the specified file.
 * @param filePath Path to the file to be read
 * @returns Result of the file reading operation
 */
function readFile(filePath: string): ReadFileOutput {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        content: '',
        message: `File '${filePath}' does not exist`,
        filePath
      };
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    return {
      success: true,
      content,
      message: 'Successfully read file contents',
      filePath
    };
  } catch (e) {
    const error = e as Error;
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
 * @returns DynamicStructuredTool instance
 */
export const createReadFileTool = new DynamicStructuredTool({
    name: 'read_file_tool',
    description: 'Read contents from an existing file',
    schema: z.object({
      filePath: z.string().describe('Path to the file to be read')
    }),
    func: async ({ filePath }) => {
      try {
        const result = readFile(filePath);
        return JSON.stringify(result);
      } catch (e) {
        const error = e as Error;
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
