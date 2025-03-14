import { Annotation } from "@langchain/langgraph";
import { MessagesAnnotation } from "@langchain/langgraph";

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
  
  // Boolean indicating if code changes are required
  code_changes: Annotation<boolean>(),
  
  // List of files that have been modified
  files_modified: Annotation<string[]>(),
  
  // Thread ID for conversation tracking
  thread_id: Annotation<string>(),
  
  // Parent branch name
  parent_branch: Annotation<string>(),
  
  // Diff content showing changes
  diff: Annotation<string>(),
  
  // Commit hash after changes are committed
  commit_hash: Annotation<string>(),
});

// Export the state type for use in nodes and edges
export type GraphStateType = typeof GraphState.State; 