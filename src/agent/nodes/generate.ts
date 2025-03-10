import { ChatOpenAI } from "@langchain/openai";
import { createEditTool } from "../tools/editTool";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { GitService } from "../utils/git";
import { GraphStateType } from "../graphState";
import * as vscode from 'vscode';
import { LogService } from "../../services/logService";
import { AIMessage, SystemMessage } from "@langchain/core/messages";

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
  
  // Initialize the model for the first LLM call
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
    apiKey: apiKey
  });
  
  // Get the analysis message (last AI message)
  const aiMessages = state.messages.filter(msg => msg._getType() === 'ai');
  const analysisMessage = aiMessages[aiMessages.length - 1];
  
  // Create system message for code generation
  const systemMessage = new SystemMessage(
    "You are an AI coding assistant. If asked, suggest code changes according to the best practices. Try formatting your code changes in unified diff format. Make sure every diff you make has only one header, you can split changes into multiple diffs if needed. Before every diff, include a little info about the file modified or created."
  );
  
  // Create messages for the model - ONLY use the analysis message, not the entire history
  const modelMessages = [
    systemMessage,
    analysisMessage, // Only include the analysis message (refined response)
    new SystemMessage(`Use the code context to implement the changes:\n\n${state.code_context}`)
  ];
  
  // Make the LLM call
  const response = await model.invoke(modelMessages);
  logService.thinking(`Generated code changes:\n\`\`\`\n${response.content}\n\`\`\``);

  // Define the schema for edited files
  const editedFilesSchema = z.object({
    edited_files: z.array(z.string())
  });
  
  // Create the agent to apply the changes
  const tools = [createEditTool(logService)];
  const agent = createReactAgent({
    llm: model,
    tools,
    prompt: "You are an expert at identifying file paths and code diffs in text. Extract the file path and the diff/changes from the following text. Apply all changes from the LLM answer to appropriate files using tools.",
    responseFormat: { type: "json_object", schema: editedFilesSchema }
  });
  
  logService.thinking("Applying code changes...");
  // Run the agent with the LLM response
  const agentResult = await agent.invoke({
    messages: [{ role: "user", content: response.content }]
  });
  
  // Extract modified file paths from agent result
  const files_modified = [];
  
  for (const msg of agentResult.messages) {
    if (msg.content && typeof msg.content === 'string' && 
        msg.content.includes("Successfully applied diff to file")) {
      // Extract file path using regex
      const fileMatch = msg.content.match(/file `([^`]+)`/);
      if (fileMatch) {
        files_modified.push(fileMatch[1]);
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
  logService.public(`Changes made:`);
  logService.diff(`${state.diff}`);
  
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
    messages: [...state.messages, summaryMessage]
  };
}; 