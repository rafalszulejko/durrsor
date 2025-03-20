import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { FileService } from '../../services/fileService';
import { LogService } from '../../services/logService';

/**
 * Interface for the output of the directory listing operation
 */
interface ListDirOutput {
  success: boolean;
  content: Array<{ path: string; type: 'file' | 'folder' }>;
  message: string;
  filePath: string; // Named filePath for UI component system compatibility
}

/**
 * List the contents of the specified directory using VSCode API.
 * @param dirPath Path to the directory to be listed (relative to workspace)
 * @returns Result of the directory listing operation
 */
async function listDir(dirPath: string): Promise<ListDirOutput> {
  const logService = LogService.getInstance();
  try {
    const fileService = new FileService();
    const contents = await fileService.listDirectoryContents(dirPath);
    console.log('Directory contents:', JSON.stringify(contents, null, 2));
    return {
      success: true,
      content: contents,
      message: 'Successfully listed directory contents',
      filePath: dirPath
    };
  } catch (e) {
    const error = e as Error;
    logService.error('List directory', `Error listing directory: ${error.message}`);
    return {
      success: false,
      content: [],
      message: `Error listing directory: ${error.message}`,
      filePath: dirPath
    };
  }
}

/**
 * Create a list directory tool that shows files and folders in a directory.
 * This tool is designed to work within a VSCode extension context.
 * 
 * @returns DynamicStructuredTool instance
 */
export function createListDirTool(): DynamicStructuredTool<any> {
  const logService = LogService.getInstance();
  return new DynamicStructuredTool({
    name: 'list_dir_tool',
    description: 'List contents (files and directories) of a specified directory',
    schema: z.object({
      dirPath: z.string().describe('Path to the directory to be listed (relative to workspace)')
    }),
    func: async ({ dirPath }) => {
      try {
        const result = await listDir(dirPath);
        return JSON.stringify(result);
      } catch (e) {
        const error = e as Error;
        logService.error('List directory', `Error during directory listing process: ${error.message}`);
        const result: ListDirOutput = {
          success: false,
          content: [],
          message: `Error during directory listing process: ${error.message}`,
          filePath: dirPath
        };
        return JSON.stringify(result);
      }
    }
  });
} 