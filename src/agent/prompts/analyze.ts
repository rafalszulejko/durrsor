import { ConversationMode } from "../types/conversationMode";
import { LogService } from "../../services/logService";

// Common prompt elements for reuse
const COMMON_HEADER = `You are an expert at analyzing code and user requests.`;

const TOOL_INSTRUCTIONS = `
<tools>
<tool name="read_file_tool">
You can read files using the read_file_tool.
</tool>
<tool name="list_dir_tool">
You can list files in the directory using the list_dir_tool to get the list of files in the directory you might want to read. 
You can use list_dir_tool up to 3 times between file reads. If you can't find anything after 3 times, give up and finish.
</tool>
<tool name="search_file_tool">
You can search for specific files by name using the search_file_tool. If you can't find the file, assume it doesn't exist.
Make sure the search query doesn't include slashes.
</tool>
</tools>`;

const CONTEXT_GATHERING_INSTRUCTIONS = `
First use tool calls to gather any necessary context about the codebase.
When you've gathered enough context to properly analyze the request, STOP making tool calls.
If looking for a file, prefer specific search over listing files.
If you were searching for a specific file and couldn't find it, simply state that it doesn't exist.
`;

/**
 * Builds a coherent prompt for the context agent based on conversation mode
 * 
 * @param mode The current conversation mode
 * @param logThinking If true, logs generated prompt with thinking level, otherwise uses internal level
 * @param selectedFilesContent Optional content of files already selected by the user
 * @returns A complete agent prompt combining context gathering and appropriate analysis instructions
 */
export function buildContextAgentPrompt(
  mode: ConversationMode, 
  logThinking: boolean = false,
  selectedFilesContent?: string
): string {
  const logService = LogService.getInstance();
  
  let analysisInstructions = '';
  let analysisGoal = '';
  
  // Select the appropriate analysis instructions based on the conversation mode
  if (mode === ConversationMode.VALIDATION_FEEDBACK) {
    analysisInstructions = `
Focus specifically on the validation feedback provided in the last AI message.
Do not address the user directly, only provide instructions to the next LLM that will make code changes.
For each issue that needs to be fixed, specify:
1. The full file path that needs to be modified
2. A precise description of what changes need to be made to fix the issue`;
    
    analysisGoal = `Your goal is to analyze issues from validation feedback and provide specific instructions for fixing them.`;
  } 
  else if (mode === ConversationMode.CHANGE_REQUEST) {
    analysisInstructions = `
Focus on the latest user message but consider the entire conversation history.
Do not address the user directly, only provide instructions to the next LLM that will make code changes.
For each change needed, you MUST specify BOTH:
1. The full file path that needs to be modified
2. A precise description of what changes need to be made. No code though.`;
    
    analysisGoal = `Your goal is to analyze the user's change request and provide specific instructions for implementing it.`;
  } 
  else {
    analysisInstructions = `
Focus on the latest user message but consider the entire conversation history.
Provide relevant information or explanations based on the user's request.
Do not suggest any code changes, as the user is only looking for information or explanation.
Be thorough and precise in your explanations, referencing specific parts of the code when relevant.`;
    
    analysisGoal = `Your goal is to provide information about the code without suggesting changes.`;
  }
  
  // Build the base prompt
  const basePrompt = `${COMMON_HEADER}

${analysisGoal}

You need to complete two tasks:
1. Gather relevant code context using available tools
2. Provide a detailed analysis based on the gathered context

${TOOL_INSTRUCTIONS}

${CONTEXT_GATHERING_INSTRUCTIONS}

After gathering context, analyze the code and respond to the user's query with a detailed analysis.
${analysisInstructions}

Be thorough in your analysis and proactive in your proposed solutions.`;

  // Log the base prompt
  if (logThinking) {
    logService.thinking(`Generated base context agent prompt:\n${basePrompt}`);
  } else {
    logService.internal(`Generated base context agent prompt:\n${basePrompt}`);
  }
  
  // Add selected files content if provided
  if (selectedFilesContent) {
    return `${basePrompt}\n\nHere are files that the user has selected. No need to read them again:\n${selectedFilesContent}`;
  }
  
  return basePrompt;
}