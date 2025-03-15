import * as path from 'path';
import * as diff from 'diff';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { fixDiffLineNumbers } from './diffFix';
import { FileService } from '../../services/fileService';
import * as vscode from 'vscode';
import { LogService } from '../../services/logService';

/**
 * Interface for the output of the diff application
 */
interface DiffApplierOutput {
  success: boolean;
  message: string;
  filePath: string;
}

/**
 * Apply the diff to the specified file.
 * @param file Path to the file to be modified
 * @param diffContent The diff content to be applied
 * @param logService LogService instance for logging
 * @returns Result of the diff application
 */
async function applyDiff(file: string, diffContent: string, logService: LogService): Promise<DiffApplierOutput> {
  try {
    const filePath = file;
    const fileService = new FileService();
    
    // Ensure directory exists
    const dirPath = path.dirname(filePath);
    if (!vscode.workspace.workspaceFolders) {
      logService.error('Apply diff', 'No workspace folder found');
      return {
        success: false,
        message: 'No workspace folder found',
        filePath: file
      };
    }
    
    // Parse the diff
    const parsedDiff = diff.parsePatch(diffContent);
    
    if (!parsedDiff || parsedDiff.length === 0) {
      logService.error('Apply diff', 'Failed to create patch from diff');
      return {
        success: false,
        message: 'Failed to create patch from diff',
        filePath: file
      };
    }
    
    // Apply the patch
    let fileContent = '';
    
    // Check if file exists and get its content using FileService
    try {
      fileContent = await fileService.getFileContent(filePath);
    } catch (error) {
      // File doesn't exist yet, which is fine for new files
      logService.error('Apply diff', `File doesn't exist`);
    }
    
    // Apply each hunk in the patch
    const patchResult = diff.applyPatch(fileContent, parsedDiff[0]);
    
    if (typeof patchResult === 'boolean' && !patchResult) {
      logService.error('Apply diff', 'Failed to apply patch to file');
      return {
        success: false,
        message: 'Failed to apply patch to file',
        filePath: file
      };
    }
    
    // Write the patched content back to the file using FileService
    const writeResult = await fileService.writeToExistingFile(filePath, patchResult as string);
    
    if (!writeResult) {
      logService.error('Apply diff', 'Failed to write patched content to file');
      return {
        success: false,
        message: 'Failed to write patched content to file',
        filePath: file
      };
    }
    
    return {
      success: true,
      message: 'Successfully applied diff to file',
      filePath: file
    };
  } catch (e) {
    const error = e as Error;
    logService.error('Apply diff', `Error applying diff: ${error.message}`);
    return {
      success: false,
      message: `Error applying diff: ${error.message}`,
      filePath: file
    };
  }
}

/**
 * Create an edit tool that applies diffs to files with automatic line number correction.
 * This tool is designed to work within a VSCode extension context.
 * 
 * @param logService LogService instance for logging
 * @returns DynamicStructuredTool instance
 */
export function createEditTool(logService: LogService): DynamicStructuredTool<any> {
  return new DynamicStructuredTool({
    name: 'edit_tool',
    description: 'Apply diff to an existing file',
    schema: z.object({
      filePath: z.string().describe('Path to the file to be modified'),
      diff: z.string().describe('The diff to be applied')
    }),
    func: async ({ filePath, diff: diffContent }) => {
      try {
        // Fix line numbers if the file exists
        diffContent = await fixDiffLineNumbers(filePath, diffContent);
        
        // Apply the fixed diff
        const result = await applyDiff(filePath, diffContent, logService);
        return JSON.stringify(result);
      } catch (e) {
        const error = e as Error;
        logService.error('Apply diff', `Error during edit process: ${error.message}`);
        const result: DiffApplierOutput = {
          success: false,
          message: `Error during edit process: ${error.message}`,
          filePath
        };
        return JSON.stringify(result);
      }
    }
  });
} 