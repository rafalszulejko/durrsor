import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { GraphState, GraphStateType } from "./graphState";
import { preanalysis as preanalysisNode } from "./nodes/preanalysis";
import { analyze as analyzeNode } from "./nodes/analyze";
import { generate as generateNode } from "./nodes/generate";
import { validation as validationNode } from "./nodes/validation";
import { LogService } from "../services/logService";
import { HumanMessage } from "@langchain/core/messages";
import { ConversationMode } from "./types/conversationMode";

/**
 * Agent class that creates and manages a LangGraph workflow for code generation.
 * Uses LangGraph.js's built-in checkpointing for message persistence.
 */
export class CodeAgent {
  private workflow: StateGraph<typeof GraphState>;
  public app: any; // The compiled LangGraph application
  private logService: LogService;
  private checkpointer: MemorySaver;

  constructor() {
    this.logService = LogService.getInstance();
    
    // Initialize the state graph
    this.workflow = new StateGraph(GraphState);

    // Create a memory saver for checkpointing
    this.checkpointer = new MemorySaver();

    // Define the nodes with wrapper functions to pass logService
    this.app = this.workflow
        .addNode("preanalysis", (state: GraphStateType) => preanalysisNode(state))
        .addNode("analyze", (state: GraphStateType) => analyzeNode(state))
        .addNode("generate", (state: GraphStateType) => generateNode(state))
        .addNode("validation", (state: GraphStateType) => validationNode(state))
        .addEdge(START, "preanalysis")
        .addConditionalEdges(
          "preanalysis",
          async (state: any) => {
            if (state.conversation_mode === ConversationMode.GENERAL_CHAT) {
              return "end";
            } else {
              return "analyze";
            }
          },
          {
            end: END,
            analyze: "analyze"
          }
        )
        .addConditionalEdges(
          "analyze",
          async (state: any) => state.conversation_mode === ConversationMode.CHANGE_REQUEST || 
                               state.conversation_mode === ConversationMode.VALIDATION_FEEDBACK ? "true" : "false",
          {
            true: "generate",
            false: END
          }
        )
        .addEdge("generate", "validation")
        .addConditionalEdges(
          "validation",
          async (state: any) => {
            if (state.conversation_mode === ConversationMode.VALIDATION_FEEDBACK) {
              return "analyze";
            } else {
              return "end";
            }
          },
          {
            analyze: "analyze",
            end: END
          }
        )
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
   * Stream events from the agent execution.
   * 
   * @param content The user's message content
   * @param selectedFiles List of files to include in the context
   * @param threadId Thread ID for the conversation
   * @returns An async iterable of events from the graph execution
   */
  async *streamEvents(
    content: string,
    selectedFiles: string[] = [],
    threadId: string
  ): AsyncIterable<any> {
    // Create a human message from the content
    const message = new HumanMessage(content);

    // Set up the configuration with thread_id and stream mode
    const config = { 
      configurable: { thread_id: threadId },
      streamMode: "messages", // Stream LLM tokens and other events
      version: "v2" // Specify the schema version
    };

    // Initialize the input state
    const inputState: Partial<GraphStateType> = {
      messages: [message],
      selected_files: selectedFiles,
      thread_id: threadId
    };

    this.logService.internal(`Streaming agent with message: ${content}`);
    this.logService.internal(`Selected files: ${selectedFiles}`);
    this.logService.internal(`Thread ID: ${threadId}`);

    // Stream events from the graph execution
    yield* this.app.streamEvents(inputState, config);
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
   * Get the latest checkpoint ID from the agent's state
   * 
   * @param threadId The thread ID
   * @returns The latest checkpoint ID or null if not found
   */
  async getLastCheckpointId(threadId: string): Promise<string | null> {
    try {
      const config = { configurable: { thread_id: threadId } };
      const state = await this.app.getState(config);
      return state.config.configurable.checkpoint_id || null;
    } catch (error) {
      this.logService.internal(`Error getting last checkpoint ID: ${error}`);
      return null;
    }
  }
} 