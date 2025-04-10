import { Annotation } from "@langchain/langgraph";
import { MessagesAnnotation } from "@langchain/langgraph";
import { ConversationMode } from "./types/conversationMode";

/**
 * GraphState defines the state schema for the agent workflow graph.
 * This extends MessagesAnnotation to leverage built-in message handling.
 */
export const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec, // Include all message handling capabilities
  
  // List of files selected for the operation
  selected_files: Annotation<string[]>(),
  
  // Context extracted from the code
  code_context: Annotation<string>(),
  
  // Conversation mode for the current graph pass
  conversation_mode: Annotation<ConversationMode>(),
  
  // List of files that have been modified
  files_modified: Annotation<string[]>(),
  
  // Thread ID for conversation tracking
  thread_id: Annotation<string>(),
  
  // Diff content showing changes
  diff: Annotation<string>(),
  
  // Commit hash after changes are committed
  commit_hash: Annotation<string>(),
});

// Export the state type for use in nodes and edges
export type GraphStateType = typeof GraphState.State; 