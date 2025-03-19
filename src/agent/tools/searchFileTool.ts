import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { FileService } from '../../services/fileService';
import { LogService } from '../../services/logService';

/**
 * Interface for the output of the file search operation
 */
interface SearchFileOutput {
  success: boolean;
  results: string[];
  message: string;
  filePath: string; // Named filePath for UI component system compatibility
}

/**
 * Search for files matching the pattern in the workspace using VSCode API.
 * @param pattern Glob pattern for files to search for
 * @param excludePattern Optional glob pattern for files to exclude
 * @param maxResults Optional upper-bound for the result
 * @returns Result of the file search operation
 */
async function searchFile(
  pattern: string, 
  excludePattern?: string, 
  maxResults?: number
): Promise<SearchFileOutput> {
  const logService = LogService.getInstance();
  try {
    const fileService = new FileService();
    const files = await fileService.searchFilesByName(pattern, excludePattern, maxResults);
    logService.thinking(`Search results: ${JSON.stringify(files, null, 2)}`);
    
    // Check if any files were found
    if (files.length === 0) {
      return {
        success: false,
        results: [],
        message: `No files found matching pattern "${pattern}"`,
        filePath: pattern
      };
    }
    
    return {
      success: true,
      results: files,
      message: `Found ${files.length} file(s) matching pattern "${pattern}"`,
      filePath: pattern // Using pattern as filePath for UI compatibility
    };
  } catch (e) {
    const error = e as Error;
    logService.error('Search files', `Error searching files: ${error.message}`);
    return {
      success: false,
      results: [],
      message: `Error searching files: ${error.message}`,
      filePath: pattern
    };
  }
}

/**
 * Create a search file tool that finds files matching a pattern.
 * This tool is designed to work within a VSCode extension context.
 * 
 * @returns DynamicStructuredTool instance
 */
export function createSearchFileTool(): DynamicStructuredTool<any> {
  const logService = LogService.getInstance();
  return new DynamicStructuredTool({
    name: 'search_file_tool',
    description: 'Search for files matching a glob pattern in the workspace',
    schema: z.object({
      pattern: z.string().describe('Glob pattern for files to search for (e.g., "**/*.ts" for all TypeScript files)'),
      excludePattern: z.string().optional().describe('Optional glob pattern for files to exclude (e.g., "**/node_modules/**")'),
      maxResults: z.number().optional().describe('Optional upper-bound for the number of results returned')
    }),
    func: async ({ pattern, excludePattern, maxResults }) => {
      try {
        const result = await searchFile(pattern, excludePattern, maxResults);
        return JSON.stringify(result);
      } catch (e) {
        const error = e as Error;
        logService.error('Search files', `Error during search process: ${error.message}`);
        const result: SearchFileOutput = {
          success: false,
          results: [],
          message: `Error during search process: ${error.message}`,
          filePath: pattern
        };
        return JSON.stringify(result);
      }
    }
  });
} 