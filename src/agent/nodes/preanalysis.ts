import { SystemMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { GraphStateType } from "../graphState";
import { LogService } from "../../services/logService";
import { ConversationMode } from "../types/conversationMode";
import { PREANALYSIS_SYSTEM_PROMPT, GENERAL_CHAT_SYSTEM_PROMPT, MODE_DETECTION_SYSTEM_PROMPT } from "../prompts/preanalysis";
import { ModelService } from "../../services/modelService";

// Define the schema for the mode detection response
const modeDetectionSchema = z.object({
  conversation_mode: z.enum([
    ConversationMode.GENERAL_CHAT,
    ConversationMode.CODEBASE_CHAT,
    ConversationMode.CHANGE_REQUEST
  ]).describe("The conversation mode for this interaction")
});

/**
 * Preanalysis node that:
 * 1. Determines the conversation mode for the current graph pass
 * 2. For general chat, generates a complete response
 * 3. For codebase chat or change request, provides an initial response
 * 
 * @param state Current graph state containing messages
 * @returns Updated state with conversation mode and updated messages
 */
export const preanalysis = async (state: GraphStateType) => {
  const logService = LogService.getInstance();
  logService.internal("Starting preanalysis...");
  
  // Get the model provider instance
  const modelProvider = ModelService.getInstance();
  
  // Initialize the model for mode detection
  const modeDetectionModel = modelProvider.getSmallModel(0, false).withStructuredOutput(modeDetectionSchema);
  
  // Make the LLM call to determine conversation mode
  logService.internal("Determining conversation mode...");
  const modeResponse = await modeDetectionModel.invoke([
    new SystemMessage(MODE_DETECTION_SYSTEM_PROMPT),
    ...state.messages
  ]);

  const conversationMode = modeResponse.conversation_mode;
  logService.internal(`Conversation mode determined: ${conversationMode}`);
  
  // Handle the response based on the conversation mode
  let responseContent = "";
  
  if (conversationMode === ConversationMode.GENERAL_CHAT) {
    logService.internal("General chat mode detected, generating complete response...");
    
    // Use a more capable model for the complete response
    const chatModel = modelProvider.getBigModel(0.7, true);
    
    // Create a system message for general chat
    const chatSystemMessage = new SystemMessage(GENERAL_CHAT_SYSTEM_PROMPT);
    
    // Make the LLM call with streaming
    const chatResponseStream = await chatModel.stream([
      chatSystemMessage,
      ...state.messages
    ]);
    
    // Process the stream to collect the full response
    try {
      for await (const chunk of chatResponseStream) {
        if (chunk.content) {
          responseContent += chunk.content;
        }
      }
    } catch (error) {
      logService.internal(`Error streaming response: ${error}`);
      const fallbackResponse = await chatModel.invoke([
        chatSystemMessage,
        ...state.messages
      ]);
      responseContent = typeof fallbackResponse.content === 'string' 
        ? fallbackResponse.content 
        : JSON.stringify(fallbackResponse.content);
    }
  } else {
    // For codebase chat or change request, generate an initial response
    logService.internal(`${conversationMode} mode detected, generating initial response...`);
    
    // Use the preanalysis model for the initial response
    const initialResponseModel = modelProvider.getSmallModel(0.2, true);
    
    // Create a system message for the initial response
    const initialResponseSystemMessage = new SystemMessage(PREANALYSIS_SYSTEM_PROMPT);
    
    // Make the LLM call with streaming
    const initialResponseStream = await initialResponseModel.stream([
      initialResponseSystemMessage,
      ...state.messages
    ]);
    
    // Process the stream to collect the full response
    try {
      for await (const chunk of initialResponseStream) {
        if (chunk.content) {
          responseContent += chunk.content;
        }
      }
    } catch (error) {
      logService.internal(`Error streaming initial response: ${error}`);
      const fallbackResponse = await initialResponseModel.invoke([
        initialResponseSystemMessage,
        ...state.messages
      ]);
      responseContent = typeof fallbackResponse.content === 'string' 
        ? fallbackResponse.content 
        : JSON.stringify(fallbackResponse.content);
    }
  }
  
  // Create an AI message with the response
  const aiResponse = new AIMessage(responseContent);
  
  // Return updated state with the response and conversation mode
  return {
    conversation_mode: conversationMode,
    messages: [...state.messages, aiResponse]
  };
}; 