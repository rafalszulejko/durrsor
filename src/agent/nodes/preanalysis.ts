import { BaseMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import * as vscode from 'vscode';
import { GraphStateType } from "../graphState";
import { LogService } from "../../services/logService";
import { ConversationMode } from "../types/conversationMode";
import { PREANALYSIS_SYSTEM_PROMPT, GENERAL_CHAT_SYSTEM_PROMPT } from "../prompts/preanalysis";

// Define the schema for the preanalysis response
const preanalysisSchema = z.object({
  response: z.string().describe("A brief, helpful response to the user's query"),
  response_mode: z.enum([
    ConversationMode.GENERAL_CHAT,
    ConversationMode.CODEBASE_CHAT,
    ConversationMode.CHANGE_REQUEST
  ]).describe("The conversation mode for this interaction")
});

/**
 * Get the API key from VS Code configuration or environment variables
 */
const getApiKey = (): string => {
  const config = vscode.workspace.getConfiguration('durrsor');
  return config.get<string>('apiKey') || process.env.OPENAI_API_KEY || '';
};

/**
 * Preanalysis node that:
 * 1. Provides an initial response to the user
 * 2. Determines the conversation mode for the current graph pass
 * 3. For general chat, generates a complete response
 * 
 * @param state Current graph state containing messages
 * @param logService Service for logging
 * @returns Updated state with conversation mode and updated messages
 */
export const preanalysis = async (state: GraphStateType, logService: LogService) => {
  logService.internal("Starting preanalysis...");
  
  // Initialize the model
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini", // Using a smaller model for quick classification
    temperature: 0,
    streaming: false,
    apiKey: getApiKey()
  });

  // Create the system message for preanalysis
  const systemMessage = new SystemMessage(PREANALYSIS_SYSTEM_PROMPT);
  
  // Create the model with structured output
  const modelWithStructure = model.withStructuredOutput(preanalysisSchema);
  
  // Make the LLM call
  logService.internal("Determining conversation mode...");
  const response = await modelWithStructure.invoke([
    systemMessage,
    ...state.messages
  ]);

  logService.internal(`Conversation mode determined: ${response.response_mode}`);
  
  // Create an AI message with the initial response
  const initialResponse = new AIMessage(response.response);
  
  // For general chat, generate a complete response
  if (response.response_mode === ConversationMode.GENERAL_CHAT) {
    logService.internal("General chat mode detected, generating complete response...");
    
    // Use a more capable model for the complete response
    const chatModel = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.7,
      streaming: true,
      apiKey: getApiKey()
    });
    
    // Create a system message for general chat
    const chatSystemMessage = new SystemMessage(GENERAL_CHAT_SYSTEM_PROMPT);
    
    // Make the LLM call with streaming
    const chatResponseStream = await chatModel.stream([
      chatSystemMessage,
      ...state.messages
    ]);
    
    // Process the stream to collect the full response
    let chatResponseContent = "";
    try {
      for await (const chunk of chatResponseStream) {
        if (chunk.content) {
          chatResponseContent += chunk.content;
        }
      }
    } catch (error) {
      logService.internal(`Error streaming response: ${error}`);
      const fallbackResponse = await chatModel.invoke([
        chatSystemMessage,
        ...state.messages
      ]);
      chatResponseContent = typeof fallbackResponse.content === 'string' 
        ? fallbackResponse.content 
        : JSON.stringify(fallbackResponse.content);
    }
    
    // Create an AI message with the complete response
    const completeResponse = new AIMessage(chatResponseContent);
    
    // Return updated state with the AI messages and conversation mode
    return {
      conversation_mode: response.response_mode,
      messages: [...state.messages, initialResponse, completeResponse]
    };
  }
  
  // For codebase chat or change request, just return the initial response
  return {
    conversation_mode: response.response_mode,
    messages: [...state.messages, initialResponse]
  };
}; 