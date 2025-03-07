import * as fs from 'fs';
import * as path from 'path';
import * as diff from 'diff';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { fixDiffLineNumbers } from './diffFix';

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
 * @returns Result of the diff application
 */
function applyDiff(file: string, diffContent: string): DiffApplierOutput {
  try {
    const filePath = file;
    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    
    // Parse the diff
    const parsedDiff = diff.parsePatch(diffContent);
    
    if (!parsedDiff || parsedDiff.length === 0) {
      return {
        success: false,
        message: 'Failed to create patch from diff',
        filePath: file
      };
    }
    
    // Apply the patch
    let fileContent = '';
    if (fs.existsSync(filePath)) {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    }
    
    // Apply each hunk in the patch
    const patchResult = diff.applyPatch(fileContent, parsedDiff[0]);
    
    if (typeof patchResult === 'boolean' && !patchResult) {
      return {
        success: false,
        message: 'Failed to apply patch to file',
        filePath: file
      };
    }
    
    // Write the patched content back to the file
    fs.writeFileSync(filePath, patchResult);
    
    return {
      success: true,
      message: 'Successfully applied diff to file',
      filePath: file
    };
  } catch (e) {
    const error = e as Error;
    return {
      success: false,
      message: `Error applying diff: ${error.message}`,
      filePath: file
    };
  }
}

/**
 * Edit tool that applies diffs to files with automatic line number correction.
 * This tool is designed to work within a VSCode extension context.
 */
export const createEditTool = new DynamicStructuredTool({
  name: 'edit_tool',
  description: 'Apply diff to an existing file',
  schema: z.object({
    filePath: z.string().describe('Path to the file to be modified'),
    diff: z.string().describe('The diff to be applied')
  }),
  func: async ({ filePath, diff: diffContent }) => {
    try {
      // Fix line numbers if the file exists
      if (fs.existsSync(filePath)) {
        diffContent = fixDiffLineNumbers(filePath, diffContent);
      }
      
      // Apply the fixed diff
      const result = applyDiff(filePath, diffContent);
      return JSON.stringify(result);
    } catch (e) {
      const error = e as Error;
      const result: DiffApplierOutput = {
        success: false,
        message: `Error during edit process: ${error.message}`,
        filePath
      };
      return JSON.stringify(result);
    }
  }
}); 