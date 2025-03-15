import { ChatOpenAI } from "@langchain/openai";
import { createEditTool } from "../tools/editTool";
import { createReplaceFileTool } from "../tools/replaceFileTool";
import { createCreateFileTool } from "../tools/createFileTool";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { GitService } from "../utils/git";
import { GraphStateType } from "../graphState";
import * as vscode from 'vscode';
import { LogService } from "../../services/logService";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { 
  CODE_GENERATION_SYSTEM_PROMPT, 
  APPLY_CHANGES_AGENT_PROMPT 
} from "../prompts/generate";

/**
 * Generate node that:
 * 1. Makes LLM call with analysis message and code context
 * 2. Uses agent to apply changes from LLM response
 * 
 * @param state Current graph state containing messages and code context
 * @returns Updated state with modified files tracked
 */
export const generate = async (state: GraphStateType, logService: LogService) => {
  // Get API key from extension settings
  const config = vscode.workspace.getConfiguration('durrsor');
  const apiKey = config.get<string>('apiKey') || process.env.OPENAI_API_KEY || '';
  
  // Initialize the model for the first LLM call with streaming enabled
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
    apiKey: apiKey,
    streaming: true
  });
  
  // Get the analysis message (last AI message)
  const aiMessages = state.messages.filter(msg => msg._getType() === 'ai');
  const analysisMessage = aiMessages[aiMessages.length - 1];
  
  logService.internal("Generating code changes based on the analysis...");
  
  // Create system message for code generation
  const systemMessage = new SystemMessage(CODE_GENERATION_SYSTEM_PROMPT);
  
  // Create messages for the model - ONLY use the analysis message, not the entire history
  const modelMessages = [
    systemMessage,
    new SystemMessage(`${state.code_context}`),
    analysisMessage
  ];
  
  // Make the LLM call with streaming
  const responseStream = await model.stream(modelMessages);
  
  // Create a new AI message for the code generation
  const response = new AIMessage("");
  let responseContent = "";
  
  // Process the stream to collect the full response
  try {
    for await (const chunk of responseStream) {
      if (chunk.content) {
        responseContent += chunk.content;
      }
    }
    
    // Set the final content
    response.content = responseContent;
  } catch (error) {
    // If streaming fails, fall back to regular invoke
    logService.internal(`Error streaming response: ${error}`);
    const fallbackResponse = await model.invoke(modelMessages);
    response.content = typeof fallbackResponse.content === 'string' 
      ? fallbackResponse.content 
      : JSON.stringify(fallbackResponse.content);
  }
  
  logService.internal("Applying code changes...");

  // Define the schema for edited files
  const editedFilesSchema = z.object({
    edited_files: z.array(z.string())
  });
  
  // Create the agent to apply the changes
  const tools = [createEditTool(logService), createReplaceFileTool(logService), createCreateFileTool(logService)];
  const agent = createReactAgent({
    llm: model,
    tools,
    prompt: APPLY_CHANGES_AGENT_PROMPT,
    responseFormat: { type: "json_object", schema: editedFilesSchema }
  });
  
  // Run the agent with the LLM response
  const agentResult = await agent.invoke({
    messages: [{ role: "user", content: response.content }]
  });
  
  // Extract modified file paths from agent result
  const files_modified = [];
  
  for (const msg of agentResult.messages) {
    if (msg.content && typeof msg.content === 'string' && 
        (msg.content.includes("Successfully applied diff to file") || 
         msg.content.includes("Successfully replaced file contents"))) {
      // Extract file path using regex
      const fileMatch = msg.content.match(/file `([^`]+)`/) || msg.content.match(/file '([^']+)'/) || msg.content.match(/filePath":"([^"]+)"/);
      if (fileMatch) {
        files_modified.push(fileMatch[1]);
        logService.internal(`Modified file: ${fileMatch[1]}`);
      }
    }
  }
  
  // Get structured response if available
  if (agentResult.structuredResponse && agentResult.structuredResponse.edited_files) {
    state.files_modified = agentResult.structuredResponse.edited_files;
  } else {
    state.files_modified = files_modified;
  }
  
  // Get diff and create commit
  state.diff = await GitService.diff();
  logService.internal(`Changes made to: ${state.files_modified.join(', ')}`);
  
  // Create a summary message
  const summaryMessage = new AIMessage(
    `Changes applied:\n\n` +
    `Files modified: ${state.files_modified.join(', ')}\n\n` +
    `${response.content}`
  );
  
  // Return updated state with the new message
  return {
    files_modified: state.files_modified,
    diff: state.diff,
    messages: [...state.messages, response, summaryMessage]
  };
}; 