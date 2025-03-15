import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { FileService } from '../../services/fileService';
import { LogService } from '../../services/logService';

/**
 * Interface for the output of the file creation
 */
interface FileCreationOutput {
  success: boolean;
  message: string;
  filePath: string;
}

/**
 * Create a new file with the specified content.
 * @param filePath Path to the file to be created
 * @param content The content to write to the file
 * @param logService LogService instance for logging
 * @returns Result of the file creation
 */
async function createFile(filePath: string, content: string, logService: LogService): Promise<FileCreationOutput> {
  try {
    const fileService = new FileService();
    
    // Create the file with content
    await fileService.createNewFile(filePath, content);
    
    return {
      success: true,
      message: 'Successfully created file',
      filePath
    };
  } catch (e) {
    const error = e as Error;
    logService.error('Create file', `Error creating file: ${error.message}`);
    return {
      success: false,
      message: `Error creating file: ${error.message}`,
      filePath
    };
  }
}

/**
 * Create a tool for creating new files with specified content.
 * This tool is designed to work within a VSCode extension context.
 * 
 * @param logService LogService instance for logging
 * @returns DynamicStructuredTool instance
 */
export function createCreateFileTool(logService: LogService): DynamicStructuredTool<any> {
  return new DynamicStructuredTool({
    name: 'create_file',
    description: 'Create a new file with the specified content. Will throw an error if the file already exists.',
    schema: z.object({
      filePath: z.string().describe('Path to the file to be created (relative to workspace)'),
      content: z.string().describe('The content to write to the file')
    }),
    func: async ({ filePath, content }) => {
      try {
        const result = await createFile(filePath, content, logService);
        return JSON.stringify(result);
      } catch (e) {
        const error = e as Error;
        logService.error('Create file', `Error during file creation process: ${error.message}`);
        const result: FileCreationOutput = {
          success: false,
          message: `Error during file creation process: ${error.message}`,
          filePath
        };
        return JSON.stringify(result);
      }
    }
  });
} 