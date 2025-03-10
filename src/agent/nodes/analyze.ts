import { ChatOpenAI } from "@langchain/openai";
import { createReadFileTool } from "../tools/readFileTool";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { GraphStateType } from "../graphState";
import * as vscode from 'vscode';
import { FileService } from "../../services/fileService";
import { LogService } from "../../services/logService";
import { AIMessage, SystemMessage } from "@langchain/core/messages";

/**
 * Analyze node that processes the messages and prepares for code generation.
 * 
 * 1. Uses reactive agent to gather relevant file contents
 * 2. Refines the user prompt into a precise action plan
 */
export const analyze = async (state: GraphStateType, logService: LogService) => {
  const config = vscode.workspace.getConfiguration('durrsor');
  const apiKey = config.get<string>('apiKey') || process.env.OPENAI_API_KEY || '';
  
  // Initialize the model
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
    apiKey: apiKey
  });
  
  // Create the agent for context gathering
  const tools = [createReadFileTool(logService)];
  const contextAgent = createReactAgent({
    llm: model,
    tools,
    prompt: `You are an expert at understanding code dependencies and context. 
    Your task is to read user messages and selected files, and determine if the files you have are enough to fulfill the user's request. 
    If not, use the tool to read any additional files.`
  });
  
  // Get the latest user message
  const userMessages = state.messages.filter(msg => msg._getType() === 'human');
  const latestUserMessage = userMessages[userMessages.length - 1];
  
  logService.thinking("Agent is analyzing the code context...");
  
  // Run the agent to gather context
  const agentResult = await contextAgent.invoke({
    messages: [
      ...state.messages, // Pass the entire conversation history
      { role: "user", content: `Selected files: ${state.selected_files.join(', ')}` }
    ]
  });

  let gatheredContext = "";

  // Process all tool call arguments
  for (const msg of agentResult.messages) {
    // Check if the message has tool calls (using type assertion with caution)
    const msgAny = msg as any;
    if (msgAny.tool_calls) {
      for (const call of msgAny.tool_calls) {
        if (!state.selected_files.includes(call.args.file_path)) {
          state.selected_files.push(call.args.file_path);
          logService.thinking(`Adding file to context: ${call.args.file_path}`);
        }
      }
    }
  }

  logService.thinking(`Selected files for analysis: ${state.selected_files.join(', ')}`);
  const fileService = new FileService();

  // Read content of all selected files
  for (const file of state.selected_files) {
    try {
      const content = await fileService.getFileContent(file);
      gatheredContext += `${file}\n\`\`\`\n${content}\n\`\`\`\n\n`;
      logService.internal(`Read file: ${file}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logService.error('analyze', `Error reading file ${file}: ${errorMessage}`);
    }
  }
  
  logService.internal(`gatheredContext:\n${gatheredContext}`);
  
  logService.thinking("Analyzing code to determine necessary changes...");
  
  // Create system message for analysis
  const systemMessage = new SystemMessage(
    `You are an expert at analyzing code changes.
Your task is to translate a user's request into a precise specification of what files need to be modified and how.
Format your response as:
File: <filepath>
Changes needed:
- <specific change 1>
- <specific change 2>

Do not include specific code changes, line numbers or diffs, but full path must be included. Repeat for each file that needs changes.`
  );
  
  // Create messages for the model
  const modelMessages = [
    systemMessage,
    ...state.messages, // Include the entire conversation history
    new SystemMessage(`Based on this code context:\n\n${gatheredContext}\n\nWhat precise changes need to be made to which files?`)
  ];
  
  // Get the refined response
  const refinedResponse = await model.invoke(modelMessages);
  
  // Log the analysis results
  logService.public(`Analysis complete. Determined changes needed:`);
  logService.public(`${refinedResponse.content}`);
  
  // Return updated state with the AI message
  return {
    code_context: gatheredContext,
    messages: [...state.messages, refinedResponse]
  };
}; 