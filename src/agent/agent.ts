import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { GraphState, GraphStateType } from "./graphState";
import { analyze as analyzeNode } from "./nodes/analyze";
import { generate as generateNode } from "./nodes/generate";
import { LogService } from "../services/logService";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";

/**
 * Agent class that creates and manages a LangGraph workflow for code generation.
 * Uses LangGraph.js's built-in checkpointing for message persistence.
 */
export class CodeAgent {
  private workflow: StateGraph<typeof GraphState>;
  public app: any; // The compiled LangGraph application
  private logService: LogService;
  private checkpointer: MemorySaver;

  constructor(logService: LogService) {
    this.logService = logService;
    
    // Initialize the state graph
    this.workflow = new StateGraph(GraphState);

    // Create a memory saver for checkpointing
    this.checkpointer = new MemorySaver();

    // Define the nodes with wrapper functions to pass logService
    this.app = this.workflow
        .addNode("analyze", (state: GraphStateType) => analyzeNode(state, this.logService))
        .addNode("generate", (state: GraphStateType) => generateNode(state, this.logService))
        .addEdge(START, "analyze")
        .addEdge("analyze", "generate")
        .addEdge("generate", END)
        .compile({ checkpointer: this.checkpointer });
  }

  /**
   * Invoke the agent with a new message.
   * 
   * @param content The user's message content
   * @param selectedFiles List of files to include in the context
   * @param threadId Thread ID for the conversation
   * @returns The result of the graph execution
   */
  async invoke(
    content: string,
    selectedFiles: string[] = [],
    threadId: string
  ): Promise<GraphStateType> {
    // Create a human message from the content
    const message = new HumanMessage(content);

    // Set up the configuration with thread_id
    const config = { configurable: { thread_id: threadId } };

    // Initialize the input state
    const inputState: Partial<GraphStateType> = {
      messages: [message],
      selected_files: selectedFiles,
      thread_id: threadId
    };

    this.logService.internal(`Invoking agent with message: ${content}`);
    this.logService.internal(`Selected files: ${selectedFiles}`);
    this.logService.internal(`Thread ID: ${threadId}`);

    // Invoke the graph with the input state and configuration
    return await this.app.invoke(inputState, config);
  }

  /**
   * Get the current state for a thread.
   * 
   * @param threadId The thread ID
   * @returns The current state for the thread
   */
  async getState(threadId: string): Promise<GraphStateType | null> {
    try {
      const config = { configurable: { thread_id: threadId } };
      const state = await this.app.getState(config);
      return state.values;
    } catch (error) {
      this.logService.internal(`Error getting state for thread ${threadId}: ${error}`);
      return null;
    }
  }

  /**
   * Get the history of states for a thread.
   * 
   * @param threadId The thread ID
   * @returns The history of states for the thread
   */
  async getStateHistory(threadId: string): Promise<GraphStateType[]> {
    try {
      const config = { configurable: { thread_id: threadId } };
      const history = await this.app.getStateHistory(config);
      return history.map((snapshot: { values: GraphStateType }) => snapshot.values);
    } catch (error) {
      this.logService.internal(`Error getting state history for thread ${threadId}: ${error}`);
      return [];
    }
  }
} 