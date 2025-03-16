import { ChatOpenAI } from "@langchain/openai";
import { createReadFileTool } from "../tools/readFileTool";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { GraphStateType } from "../graphState";
import * as vscode from 'vscode';
import { FileService } from "../../services/fileService";
import { LogService } from "../../services/logService";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { ANALYZE_INFO_PROMPT, ANALYZE_CHANGES_PROMPT, CONTEXT_AGENT_PROMPT, VALIDATION_FEEDBACK_PROMPT } from "../prompts/analyze";
import { ConversationMode } from "../types/conversationMode";

/**
 * Analyze node that processes the messages and prepares for code generation.
 * 
 * 1. Uses reactive agent to gather relevant file contents
 * 2. Refines the user prompt into a precise action plan
 */
export const analyze = async (state: GraphStateType, logService: LogService) => {
  const config = vscode.workspace.getConfiguration('durrsor');
  const apiKey = config.get<string>('apiKey') || process.env.OPENAI_API_KEY || '';
  
  // Initialize the model with streaming enabled
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
    apiKey: apiKey,
    streaming: true
  });
  
  // Create the agent for context gathering with streaming enabled
  const tools = [createReadFileTool(logService)];
  const contextAgent = createReactAgent({
    llm: model,
    tools,
    prompt: CONTEXT_AGENT_PROMPT
  });
  
  logService.internal("Starting context analysis...");
  
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
    logService.internal(`Processing message from context agent: ${JSON.stringify(msg)}`);
    const msgAny = msg as any;
    if (msgAny.tool_calls) {
      for (const call of msgAny.tool_calls) {
        if (!state.selected_files.includes(call.args.file_path)) {
          state.selected_files.push(call.args.file_path);
          logService.internal(`Adding file to context: ${call.args.file_path}`);
        }
      }
    }
  }

  logService.internal(`Selected files for analysis: ${state.selected_files.join(', ')}`);
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
  
  logService.internal(`Analyzing code with conversation mode: ${state.conversation_mode}`);
  
  // Select the appropriate system prompt based on the conversation mode
  let systemPrompt;
  if (state.conversation_mode === ConversationMode.VALIDATION_FEEDBACK) {
    systemPrompt = VALIDATION_FEEDBACK_PROMPT;
  } else if (state.conversation_mode === ConversationMode.CHANGE_REQUEST) {
    systemPrompt = ANALYZE_CHANGES_PROMPT;
  } else {
    systemPrompt = ANALYZE_INFO_PROMPT;
  }
  const systemMessage = new SystemMessage(systemPrompt);
  
  // Create messages for the model
  const modelMessages = [
    systemMessage,
    ...state.messages, // Include the entire conversation history
    new SystemMessage(`Based on this code context:\n\n${gatheredContext}\n\nProvide a detailed analysis according to the instructions.`)
  ];
  
  // Get the refined response with streaming - use stream() to enable token-by-token streaming
  const refinedResponseStream = await model.stream(modelMessages);
  
  // Create a new AI message for the analysis
  const refinedResponse = new AIMessage("");
  let refinedContent = "";
  
  // Process the stream to collect the full response
  try {
    for await (const chunk of refinedResponseStream) {
      if (chunk.content) {
        refinedContent += chunk.content;
      }
    }
    
    // Set the final content
    refinedResponse.content = refinedContent;
  } catch (error) {
    // If streaming fails, fall back to regular invoke
    logService.internal(`Error streaming response: ${error}`);
    const fallbackResponse = await model.invoke(modelMessages);
    return {
      code_context: gatheredContext,
      messages: [...state.messages, fallbackResponse]
    };
  }
  
  // Return updated state with the AI message
  return {
    code_context: gatheredContext,
    messages: [...state.messages, refinedResponse]
  };
}; 