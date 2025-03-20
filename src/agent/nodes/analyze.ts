import { createReadFileTool } from "../tools/readFileTool";
import { createListDirTool } from "../tools/listDirTool";
import { createSearchFileTool } from "../tools/searchFileTool";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { GraphStateType } from "../graphState";
import { FileService } from "../../services/fileService";
import { LogService } from "../../services/logService";
import { AIMessage, SystemMessage, isAIMessage } from "@langchain/core/messages";
import { ANALYZE_INFO_PROMPT, ANALYZE_CHANGES_PROMPT, CONTEXT_AGENT_PROMPT, VALIDATION_FEEDBACK_PROMPT } from "../prompts/analyze";
import { ConversationMode } from "../types/conversationMode";
import { ModelService } from "../../services/modelService";
import { z } from "zod";
import { MemorySaver } from "@langchain/langgraph/web";
import { randomInt } from "crypto";

/**
 * Analyze node that processes the messages and prepares for code generation.
 * 
 * 1. Uses reactive agent to gather relevant file contents
 * 2. Refines the user prompt into a precise action plan
 */
export const analyze = async (state: GraphStateType) => {
  const logService = LogService.getInstance();
  
  // Get the model provider instance
  const modelProvider = ModelService.getInstance();
  
  // Initialize the model with streaming enabled
  const contextModel = modelProvider.getBigModel(0, false);
  
  const tools = [createReadFileTool(), createListDirTool(), createSearchFileTool()];
  
  // Define schema for read files
  const readFilesSchema = z.object({
    read_file_paths: z.array(z.string()).describe("A list of file paths read by the agent")
  });
  
  // Initialize FileService and read content of selected files
  const fileService = new FileService();
  // Get content of selected files
  const selectedFilesContent = await fileService.getMultipleFilesContent(state.selected_files);
  
  // Create a modified prompt that includes the selected files content
  const enhancedContextPrompt = `${CONTEXT_AGENT_PROMPT}\n\nSelected files content:\n${selectedFilesContent}`;
  
  const contextAgent = createReactAgent({
    llm: contextModel,
    tools,
    prompt: enhancedContextPrompt,
    responseFormat: { 
      type: "json_object",
      prompt: "Full paths of the files read by the agent",
      schema: readFilesSchema 
    },
    name: "ContextAgent",
    checkpointer: new MemorySaver()
  });
  
  logService.internal("Starting context analysis...");
  
  // Run the agent to gather context without passing selected files in the message
  const agentResult = await contextAgent.invoke({
    messages: [
      ...state.messages // Pass only the conversation history
    ]
  },
  {
      configurable: {
        thread_id: randomInt(1, 1000000)
      }
  });
  logService.internal(`Context agent result: ${JSON.stringify(agentResult, null, 2)}`);

  // Extract the last non-structured AI message from the context agent
  let contextAgentMessage: AIMessage | null = null;
  if (agentResult.messages && agentResult.messages.length > 0) {
    // Find the last AI message that isn't a tool response
    for (let i = agentResult.messages.length - 1; i >= 0; i--) {
      const message = agentResult.messages[i];
      if (isAIMessage(message) && message.content && typeof message.content === 'string') {
        contextAgentMessage = new AIMessage(message.content);
        logService.thinking(`Extracted context agent message: ${message.content}`);
        break;
      }
    }
  }

  let gatheredContext = selectedFilesContent; // Start with the already read selected files

  // Add additional files from agent response
  const additionalFiles = agentResult.structuredResponse.read_file_paths.filter(
    file => !state.selected_files.includes(file)
  );
  
  state.selected_files = Array.from(new Set([
    ...state.selected_files, 
    ...agentResult.structuredResponse.read_file_paths
  ]));

  logService.internal(`Additional files discovered: ${additionalFiles.join(', ')}`);
  
  // Read content of additional files found by the agent
  for (const file of additionalFiles) {
    try {
      const content = await fileService.getFileContent(file);
      gatheredContext += `${file}\n\`\`\`\n${content}\n\`\`\`\n\n`;
      logService.internal(`Read additional file: ${file}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logService.error('analyze', `Error reading additional file ${file}: ${errorMessage}`);
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
    ...(contextAgentMessage ? [contextAgentMessage] : []),
    new SystemMessage(`Based on this code context:\n\n${gatheredContext}\n\nProvide a detailed analysis according to the instructions.`)
  ];
  const model = modelProvider.getBigModel(0, true);
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
      messages: [...state.messages, contextAgentMessage, fallbackResponse].filter(Boolean)
    };
  }
  
  // Return updated state with the AI messages
  return {
    code_context: gatheredContext,
    messages: [...state.messages, contextAgentMessage, refinedResponse].filter(Boolean)
  };
}; 