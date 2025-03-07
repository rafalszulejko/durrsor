import { Annotation } from "@langchain/langgraph";

/**
 * GraphState defines the state schema for the agent workflow graph.
 * This is converted from the Python TypedDict implementation to TypeScript
 * using LangGraph.js Annotation system.
 */
export const GraphState = Annotation.Root({
  // User's original prompt/request
  user_prompt: Annotation<string>(),
  
  // List of files selected for the operation
  selected_files: Annotation<string[]>(),
  
  // Context extracted from the code
  code_context: Annotation<string>(),
  
  // Prompt after revision/refinement
  revised_prompt: Annotation<string>(),
  
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
  
  // Optional conversation data
  conversation_data: Annotation<Record<string, any> | null>({
    value: (current, _) => current,
    default: () => null,
  }),
});

// Export the state type for use in nodes and edges
export type GraphStateType = typeof GraphState.State; 