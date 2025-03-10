import { ChatOpenAI } from "@langchain/openai";
import { createEditTool } from "../tools/editTool";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { GitService } from "../utils/git";
import { GraphStateType } from "../graphState";
import * as vscode from 'vscode';
import { LogService } from "../../services/logService";

/**
 * Generate node that:
 * 1. Makes LLM call with revised prompt and code context
 * 2. Uses agent to apply changes from LLM response
 * 
 * @param state Current graph state containing user prompt and code context
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
  
  // Create messages array similar to the notebook example
  const messages = [
    {
      role: "system", 
      content: "You are an AI coding assistant. If asked, suggest code changes according to the best practices. Try formatting your code changes in unified diff format. Make sure every diff you make has only one header, you can split changes into multiple diffs if needed. Before every diff, include a little info about the file modified or created."
    },
    {
      role: "user",
      content: state.revised_prompt
    },
    {
      role: "user",
      content: state.code_context
    }
  ];
  
  // Make the LLM call
  const response = await model.invoke(messages);
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
    // logService.thinking(`Agent action: ${typeof msg.content === 'string' ? msg.content.substring(0, 100) + '...' : 'Non-text content'}`);
    if (msg.content && typeof msg.content === 'string' && 
        msg.content.includes("Successfully applied diff to file")) {
      // Extract file path using regex
      const fileMatch = msg.content.match(/file `([^`]+)`/);
      if (fileMatch) {
        files_modified.push(fileMatch[1]);
        // logService.public(`Modified file: ${fileMatch[1]}`);
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

  logService.thinking("Generating commit message...");
  const commitMsgResponse = await model.invoke([
    { 
      role: "system", 
      content: "You are an expert at summarizing code changes. Summarize the changes made in the following diff." 
    },
    { 
      role: "user", 
      content: `Prompt: ${state.user_prompt}` 
    },
    { 
      role: "user", 
      content: `\`\`\`\n${state.diff}\n\`\`\`` 
    }
  ]);
  
  logService.thinking(`Commit message: ${commitMsgResponse.content}`);
  // Convert MessageContent to string
  const commitMessage = typeof commitMsgResponse.content === 'string' 
    ? commitMsgResponse.content 
    : JSON.stringify(commitMsgResponse.content);
  state.commit_hash = await GitService.addAllAndCommit(commitMessage);
  logService.public(`Changes committed with message: ${commitMessage}`);

  // Add a summary of changes to previous_changes
  if (!state.conversation_data) {
    state.conversation_data = {};
  }
  
  if (!state.conversation_data.previous_changes) {
    state.conversation_data.previous_changes = [];
  }
  
  const changeSummary = `User prompt:${state.user_prompt}\n\nChanged files:${state.files_modified}\n\nDiff:\n${state.diff}`;
  state.conversation_data.previous_changes.push(changeSummary);

  // Store a copy of the current state in past_states
  if (!state.conversation_data.past_states) {
    state.conversation_data.past_states = [];
  }
  
  // Create a deep copy of the current state
  const currentStateCopy = JSON.parse(JSON.stringify(state));
  // Remove the conversation_data to avoid recursive storage
  delete currentStateCopy.conversation_data;
  state.conversation_data.past_states.push(currentStateCopy);
  
  return {
    files_modified: state.files_modified,
    diff: state.diff,
    commit_hash: state.commit_hash,
    conversation_data: state.conversation_data
  };
}; 