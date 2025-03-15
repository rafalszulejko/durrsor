import { ChatOpenAI } from "@langchain/openai";
import { GraphStateType } from "../graphState";
import * as vscode from 'vscode';
import { LogService } from "../../services/logService";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { VALIDATION_PROMPT } from "../prompts/validation";
import { ConversationMode } from "../types/conversationMode";
import { GitService } from "../utils/git";
import { z } from "zod";

// Define the schema for the validation response
const validationResponseSchema = z.object({
  assessment: z.string().describe("A detailed assessment of whether the changes fulfill the user's request completely"),
  problems: z.boolean().describe("Boolean indicating whether there are any issues that need to be addressed")
});

/**
 * Validation node that:
 * 1. Checks if the user request was fulfilled by analyzing the changes
 * 2. Checks for any diagnostics/problems in the modified files
 * 3. Creates a summary or feedback message based on the validation results
 * 
 * @param state Current graph state containing messages and modified files
 * @returns Updated state with validation results and possibly updated conversation mode
 */
export const validation = async (state: GraphStateType, logService: LogService) => {
  // Get API key from extension settings
  const config = vscode.workspace.getConfiguration('durrsor');
  const apiKey = config.get<string>('apiKey') || process.env.OPENAI_API_KEY || '';
  
  // Initialize the model with structured output
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
    apiKey: apiKey,
    streaming: false
  }).withStructuredOutput(validationResponseSchema);
  
  logService.internal("Starting validation of changes...");
  
  // Get the last human message to compare with changes
  const humanMessages = state.messages.filter(msg => msg._getType() === 'human');
  const lastHumanMessage = humanMessages[humanMessages.length - 1];
  
  // Get the diff to analyze what changes were made
  const diff = state.diff || await GitService.diff();
  
  // Check for diagnostics in modified files
  const diagnosticsProblems: { file: string, problems: vscode.Diagnostic[] }[] = [];
  
  if (state.files_modified && state.files_modified.length > 0) {
    logService.internal(`Checking diagnostics for ${state.files_modified.length} modified files...`);
    
    for (const filePath of state.files_modified) {
      try {
        // Get the file URI
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {continue;}
        
        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
        
        // Get diagnostics for the file
        const diagnostics = vscode.languages.getDiagnostics(fileUri);
        
        if (diagnostics && diagnostics.length > 0) {
          logService.internal(`Found ${diagnostics.length} diagnostics in ${filePath}`);
          diagnosticsProblems.push({ file: filePath, problems: diagnostics });
        }
      } catch (error) {
        logService.error('validation', `Error checking diagnostics for ${filePath}: ${error}`);
      }
    }
  }
  
  // Format diagnostics for the LLM
  let diagnosticsText = "";
  if (diagnosticsProblems.length > 0) {
    diagnosticsText = "Diagnostics problems found:\n\n";
    
    for (const { file, problems } of diagnosticsProblems) {
      diagnosticsText += `File: ${file}\n`;
      
      for (const problem of problems) {
        const range = problem.range;
        const message = problem.message;
        const severity = problem.severity === vscode.DiagnosticSeverity.Error ? "Error" :
                        problem.severity === vscode.DiagnosticSeverity.Warning ? "Warning" :
                        problem.severity === vscode.DiagnosticSeverity.Information ? "Info" : "Hint";
        
        diagnosticsText += `- ${severity} at line ${range.start.line + 1}, column ${range.start.character + 1}: ${message}\n`;
      }
      
      diagnosticsText += "\n";
    }
  } else {
    diagnosticsText = "No diagnostics problems found in the modified files.";
  }
  
  // Create system message for validation
  const systemMessage = new SystemMessage(VALIDATION_PROMPT);
  
  // Create messages for the model
  const modelMessages = [
    systemMessage,
    new SystemMessage(`Last user request: ${lastHumanMessage.content}`),
    new SystemMessage(`Changes made (diff):\n\n${diff}`),
    new SystemMessage(`Diagnostics:\n\n${diagnosticsText}`)
  ];
  
  // Make the LLM call with structured output
  logService.internal("Calling validation model with structured output...");
  let validationResult;
  
  try {
    validationResult = await model.invoke(modelMessages);
    logService.internal(`Validation result: ${JSON.stringify(validationResult)}`);
  } catch (error) {
    logService.error('validation', `Error getting structured validation response: ${error}`);
    // Fallback to a default response if structured output fails
    validationResult = {
      assessment: `Error getting structured validation response: ${error}`,
      problems: diagnosticsProblems.length > 0 // Default to problems if there are diagnostics
    };
  }
  
  // Create a new AI message with the validation assessment
  const validationResponse = new AIMessage(validationResult.assessment);
  
  // Update conversation mode based on validation results
  let updatedConversationMode = state.conversation_mode;
  
  if (validationResult.problems) {
    // If problems were found, set to validation feedback mode
    updatedConversationMode = ConversationMode.VALIDATION_FEEDBACK;
    logService.internal("Validation found problems. Setting conversation mode to VALIDATION_FEEDBACK.");
  } else if (state.conversation_mode === ConversationMode.VALIDATION_FEEDBACK) {
    // If no problems were found and we were in validation feedback mode, switch back to change request
    updatedConversationMode = ConversationMode.CHANGE_REQUEST;
    logService.internal("No validation problems found. Switching back to CHANGE_REQUEST mode.");
  }
  
  // Return updated state with the validation message and possibly updated conversation mode
  return {
    messages: [...state.messages, validationResponse],
    conversation_mode: updatedConversationMode
  };
}; 