import { ChatOpenAI } from "@langchain/openai";
import { createReadFileTool } from "../tools/readFileTool";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import fs from "fs/promises";
import path from "path";
import { GraphStateType } from "../graphState";
import * as vscode from 'vscode';
import { FileService } from "../../services/fileService";
import { LogService } from "../../services/logService";
/**
 * Analyze node that processes the initial state and prepares it for code generation.
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
  const tools = [createReadFileTool];
  const contextAgent = createReactAgent({
    llm: model,
    tools,
    prompt: `You are an expert at understanding code dependencies and context. 
    Your task is to read user prompt and selected files, and determine if the files you have are enough to fulfill the user's request. 
    If not, use the tool to read any additional files.
    
    Previous changes made to the codebase:
    {previous_changes}`
  });
  
  // Format previous changes for context
  let previousChangesText = "";
  if (state.conversation_data?.previous_changes) {
    previousChangesText = state.conversation_data.previous_changes
      .map((change: string) => `- ${change}`)
      .join("\n");
  }

  logService.internal(`previous_changes_text:\n${previousChangesText}`);
  
  // Run the agent to gather context
  const agentResult = await contextAgent.invoke({
    messages: [
      { role: "user", content: `${state.user_prompt}` },
      { role: "user", content: `${state.selected_files}` }
    ]
  });

  let gatheredContext = "";

  logService.thinking("Agent is analyzing the code context...");
  // Process all tool call arguments
  for (const msg of agentResult.messages) {
    logService.thinking(`Agent message: ${typeof msg.content === 'string' ? msg.content.substring(0, 100) + '...' : 'Non-text content'}`);
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
      logService.thinking(`Read file: ${file}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logService.internal(`Error reading file ${file}: ${errorMessage}`);
    }
  }
  
  logService.internal(`gatheredContext:\n${gatheredContext}`);
  
  logService.thinking("Analyzing code to determine necessary changes...");
  const messages = [
    {
      role: "system",
      content: `You are an expert at analyzing code changes.
Your task is to translate a user's request into a precise specification of what files need to be modified and how.
Format your response as:
File: <filepath>
Changes needed:
- <specific change 1>
- <specific change 2>

Do not include specific code changes, line numbers or diffs, but full path must be included. Repeat for each file that needs changes.`
    },
    {
      role: "user",
      content: `Based on this code context:

${gatheredContext}

And this user request:
${state.user_prompt}

What precise changes need to be made to which files?`
    }
  ];
  
  const refinedResponse = await model.invoke(messages);
  logService.public(`Analysis complete. Determined changes needed:`);
  logService.public(`${refinedResponse.content}`);
  
  // Return updated state
  return {
    code_context: gatheredContext,
    revised_prompt: refinedResponse.content
  };
}; 