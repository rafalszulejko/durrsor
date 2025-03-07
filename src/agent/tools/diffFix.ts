import * as fs from 'fs';

/**
 * Fix incorrect line numbers in a unified diff by identifying the correct location in the original file.
 * Also ensures the diff has proper file headers.
 * 
 * @param originalFilePath Path to the original file
 * @param incorrectDiff Content of the diff with incorrect line numbers
 * @returns Updated diff with correct line numbers and file headers
 */
export function fixDiffLineNumbers(originalFilePath: string, incorrectDiff: string): string {
    // Read the original file
    const originalContent = fs.readFileSync(originalFilePath, 'utf-8').split('\n');

    // Parse the incorrect diff to extract the context
    const diffLines = incorrectDiff.trim().split('\n');
    const fileHeaders: string[] = [];
    let hunkHeaderIndex = -1;
    const contextLines: string[] = [];

    // Find the hunk header and collect context lines
    for (let i = 0; i < diffLines.length; i++) {
        const line = diffLines[i];
        if (line.startsWith('@@')) {
            hunkHeaderIndex = i;
            break;
        } else if (line.startsWith('---') || line.startsWith('+++')) {
            fileHeaders.push(line);
        }
    }

    // If we found a hunk header, collect context lines after it
    if (hunkHeaderIndex > -1) {
        for (let i = hunkHeaderIndex + 1; i < diffLines.length; i++) {
            if (diffLines[i].startsWith(' ') || diffLines[i] === '') {
                contextLines.push(diffLines[i].substring(1));  // Remove the leading space (if any)
            } else {
                // Stop collecting context once we hit a non-context line
                if (contextLines.length >= 2) {  // We have enough context
                    break;
                }
            }
        }
    }

    console.log(`context lines: ${contextLines}`);
    // Find the context in the original file
    let foundIndex = -1;
    for (let i = 0; i <= originalContent.length - contextLines.length; i++) {
        let match = true;
        for (let j = 0; j < Math.min(2, contextLines.length); j++) {  // Check first two context lines
            if (i + j >= originalContent.length || contextLines[j].trim() !== originalContent[i + j].trim()) {
                match = false;
                break;
            }
        }
        if (match) {
            foundIndex = i;
            break;
        }
    }

    if (foundIndex === -1) {
        return "Context not found in original file";
    }

    // Count lines in original and modified parts of the diff
    let linesInOriginal = 0;
    let linesInModified = 0;

    for (const line of diffLines.slice(hunkHeaderIndex + 1)) {
        if (line.startsWith(' ') || line.startsWith('-') || line === '') {
            linesInOriginal++;
        }
        if (line.startsWith(' ') || line.startsWith('+') || line === '') {
            linesInModified++;
        }
    }

    // Create a new hunk header with correct line numbers
    const actualLine = foundIndex + 1;  // Convert to 1-based line numbers
    const newHunkHeader = `@@ -${actualLine},${linesInOriginal} +${actualLine},${linesInModified} @@`;

    // Replace the incorrect hunk header with the corrected one
    const resultDiff = [...diffLines];
    resultDiff[hunkHeaderIndex] = newHunkHeader;

    // Always use the provided originalFilePath for file headers, regardless of what's in the diff
    const newFileHeaders = [`--- ${originalFilePath}`, `+++ ${originalFilePath}`];
    
    // Construct the final diff with file headers and corrected hunk header
    return [...newFileHeaders, newHunkHeader, ...diffLines.slice(hunkHeaderIndex + 1)].join('\n');
}