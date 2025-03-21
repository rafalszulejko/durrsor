import { createReadFileTool } from "../tools/readFileTool";
import { createListDirTool } from "../tools/listDirTool";
import { createSearchFileTool } from "../tools/searchFileTool";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { GraphStateType } from "../graphState";
import { FileService } from "../../services/fileService";
import { LogService } from "../../services/logService";
import { AIMessage, isAIMessage } from "@langchain/core/messages";
import { buildContextAgentPrompt } from "../prompts/analyze";
import { ModelService } from "../../services/modelService";
import { MemorySaver } from "@langchain/langgraph/web";
import { randomInt } from "crypto";

/**
 * Analyze node that processes the messages and prepares for code generation.
 * 
 * Uses reactive agent to:
 * 1. Gather relevant file contents
 * 2. Analyze the code context
 * 3. Directly provide the analysis response
 */
export const analyze = async (state: GraphStateType) => {
  const logService = LogService.getInstance();
  
  // Get the model provider instance
  const modelProvider = ModelService.getInstance();
  
  // Initialize the model with streaming enabled
  const contextModel = modelProvider.getBigModel(0, true);
  
  const tools = [createReadFileTool(), createListDirTool(), createSearchFileTool()];
  
  // Initialize FileService and read content of selected files
  const fileService = new FileService();
  // Get content of selected files
  const selectedFilesContent = await fileService.getMultipleFilesContent(state.selected_files);
  
  logService.internal(`Using conversation mode: ${state.conversation_mode}`);
  
  // Build the complete prompt with the conversation mode and selected files
  const contextAgentPrompt = buildContextAgentPrompt(
    state.conversation_mode, 
    true,  // Log with thinking level
    selectedFilesContent
  );
  
  const contextAgent = createReactAgent({
    llm: contextModel,
    tools,
    prompt: contextAgentPrompt,
    name: "ContextAgent",
    checkpointer: new MemorySaver()
  });
  
  logService.internal("Starting context analysis...");
  
  // Run the agent to gather context and provide analysis
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
  
  const contextAgentMessage = agentResult.messages
    .filter(msg => isAIMessage(msg) && msg.content && typeof msg.content === 'string')
    .pop();
  
  if (!contextAgentMessage) {
    logService.error('analyze', 'Failed to extract context agent message');
    return {
      code_context: selectedFilesContent,
      messages: [...state.messages, new AIMessage("Failed to analyze code context.")]
    };
  }
  
  return {
    code_context: selectedFilesContent,
    messages: [...state.messages, contextAgentMessage]
  };
}; 