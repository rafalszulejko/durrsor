import { GraphStateType } from "../graphState";
import * as vscode from 'vscode';
import { LogService } from "../../services/logService";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { VALIDATION_SUMMARY_PROMPT } from "../prompts/validation";
import { ConversationMode } from "../types/conversationMode";
import { GitService } from "../utils/git";
import { ModelProvider } from "../utils/modelProvider";

/**
 * Validation node that:
 * 1. Checks for any diagnostics/problems in the modified files using VSCode API
 * 2. For no problems, generates a brief summary of changes using gpt-4o-mini
 * 3. For problems found, creates a detailed message with the diagnostics
 * 
 * @param state Current graph state containing messages and modified files
 * @returns Updated state with validation results and possibly updated conversation mode
 */
export const validation = async (state: GraphStateType, logService: LogService) => {
  // Get the model provider instance
  const modelProvider = ModelProvider.getInstance();
  
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
  
  // Format diagnostics for the response
  let diagnosticsText = "";
  if (diagnosticsProblems.length > 0) {
    diagnosticsText = "I've found some issues that need to be addressed:\n\n";
    
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
    
    diagnosticsText += "Let me help you fix these issues.";
  }
  
  let validationResponse;
  let updatedConversationMode = state.conversation_mode;
  
  if (diagnosticsProblems.length > 0) {
    // If problems were found, create a message with the diagnostics
    validationResponse = new AIMessage(diagnosticsText);
    
    // Set to validation feedback mode
    updatedConversationMode = ConversationMode.VALIDATION_FEEDBACK;
    logService.internal("Diagnostics found problems. Setting conversation mode to VALIDATION_FEEDBACK.");
  } else {
    // No problems found, generate a brief summary using gpt-4o-mini
    const model = modelProvider.getSmallModel(0.2, true);
    
    // Create system message for validation summary
    const systemMessage = new SystemMessage(VALIDATION_SUMMARY_PROMPT);
    
    // Create messages for the model
    const modelMessages = [
      systemMessage,
      new SystemMessage(`Last user request: ${lastHumanMessage.content}`),
      new SystemMessage(`Changes made (diff):\n\n${diff}`)
    ];
    
    // Make the LLM call for summary
    logService.internal("Calling small model for validation summary...");
    
    const summaryResult = await model.invoke(modelMessages);
    validationResponse = new AIMessage(summaryResult.content.toString());
    logService.internal(`Validation summary generated successfully.`);
    
    // If we were in validation feedback mode, switch back to change request
    if (state.conversation_mode === ConversationMode.VALIDATION_FEEDBACK) {
      updatedConversationMode = ConversationMode.CHANGE_REQUEST;
      logService.internal("No diagnostics problems found. Switching back to CHANGE_REQUEST mode.");
    }
  }
  
  // Return updated state with the validation message and possibly updated conversation mode
  return {
    messages: [...state.messages, validationResponse],
    conversation_mode: updatedConversationMode
  };
}; 