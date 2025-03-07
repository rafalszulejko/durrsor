import { StateGraph, START, END } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import { GraphState, GraphStateType } from "./graphState";
import { analyze } from "./nodes/analyze";
import { generate } from "./nodes/generate";
import { GitService } from "./utils/git";

/**
 * Agent class that creates and manages a LangGraph workflow for code generation.
 * This is a TypeScript implementation of the Python LangGraph workflow.
 */
export class CodeAgent {
  private workflow: StateGraph<typeof GraphState>;
  private app: any; // The compiled LangGraph application

  constructor() {
    // Initialize the state graph
    this.workflow = new StateGraph(GraphState);

    // Define the nodes
    this.app = this.workflow
        .addNode("analyze", analyze)
        .addNode("generate", generate)
        .addEdge(START, "analyze")
        .addEdge("analyze", "generate")
        .addEdge("generate", END)
        .compile();
  }

  /**
   * Invoke the agent with conversation history.
   * 
   * @param userPrompt The user's request
   * @param selectedFiles List of files to include in the context
   * @param threadId Optional thread ID for the conversation
   * @param previousState Optional previous state for conversation continuity
   * @returns The result of the graph execution
   */
  async invokeWithHistory(
    userPrompt: string,
    selectedFiles: string[] = [],
    threadId?: string,
    previousState?: Partial<GraphStateType>
  ): Promise<GraphStateType> {
    // Check if previous state has a thread_id and create new one if needed
    if (previousState && previousState.thread_id) {
      threadId = previousState.thread_id;
    } else {
      threadId = uuidv4();
      // Create new branch for this thread
      await GitService.createAndCheckoutBranch(threadId);
    }

    // Combine selected files with previous ones if available
    let combinedSelectedFiles = [...selectedFiles];
    if (previousState && previousState.selected_files) {
      combinedSelectedFiles = Array.from(
        new Set([...combinedSelectedFiles, ...previousState.selected_files])
      );
    }

    console.log(`Selected files: ${combinedSelectedFiles}`);

    // Initialize the new state
    const newState: Partial<GraphStateType> = {
      user_prompt: userPrompt,
      selected_files: combinedSelectedFiles,
      thread_id: threadId
    };

    // If we have a previous state, incorporate its conversation data
    if (previousState && previousState.conversation_data) {
      newState.conversation_data = previousState.conversation_data;
    } else {
      newState.conversation_data = {
        selected_files: [],
        previous_changes: [],
        past_states: []
      };
    }

    console.log(`Running agent with state:\n\n${JSON.stringify(newState, null, 2)}\n=========================\n`);

    // Invoke the graph
    return await this.app.invoke(newState);
  }

  /**
   * Get the parent branch for a thread.
   * 
   * @param threadId The thread ID
   * @returns The parent branch name
   */
  async getParentBranch(threadId: string): Promise<string> {
    const currentBranch = await GitService.getCurrentBranch();
    return currentBranch.replace(`durrsor-${threadId}`, '');
  }

  /**
   * Squash and merge changes from a thread branch to the parent branch.
   * 
   * @param threadId The thread ID
   * @param commitMessage Optional custom commit message
   * @returns Result of the squash merge operation
   */
  async squashAndMergeToParent(threadId: string, commitMessage?: string): Promise<string> {
    const parentBranch = await this.getParentBranch(threadId);
    return await GitService.squashAndMergeToBranch(parentBranch, commitMessage);
  }
} 