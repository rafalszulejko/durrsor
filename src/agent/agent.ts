import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { GraphState, GraphStateType } from "./graphState";
import { analyze as analyzeNode } from "./nodes/analyze";
import { generate as generateNode } from "./nodes/generate";
import { LogService } from "../services/logService";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import * as vscode from 'vscode';


const codeChangeSchema = z.object({
  requires_code_changes: z.boolean()
});

/**
 * Agent class that creates and manages a LangGraph workflow for code generation.
 * Uses LangGraph.js's built-in checkpointing for message persistence.
 */
export class CodeAgent {
  private workflow: StateGraph<typeof GraphState>;
  public app: any; // The compiled LangGraph application
  private logService: LogService;
  private checkpointer: MemorySaver;
  private config = vscode.workspace.getConfiguration('durrsor');
  private apiKey = this.config.get<string>('apiKey') || process.env.OPENAI_API_KEY || '';


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
        .addConditionalEdges(
          "analyze",
          async (state: any) => {
            const model = new ChatOpenAI({
              modelName: "gpt-4o-mini",
              temperature: 0,
              streaming: false,
              apiKey: this.apiKey
            });

            const systemMessage = new SystemMessage(
              `Analyze if the LLM analysis requires any code changes. 
               Respond with a boolean value only.
               Return true if any files need to be modified, created, or deleted.
               Return false if the request is just for information, explanation, or analysis.`
            );
            // Get the latest human message from state
            const humanMessages = state.messages.filter((msg: BaseMessage) => msg._getType() === 'human');
            const latestHumanMessage = humanMessages[humanMessages.length - 1];

            const modelWithStructure = model.withStructuredOutput(codeChangeSchema);
            const response = await modelWithStructure.invoke([
              systemMessage,
              latestHumanMessage,
              state.messages[state.messages.length - 1]
            ]);
            this.logService.internal(`Response from model: ${JSON.stringify(response)}`);

            return response.requires_code_changes ? 'true' : 'false';
          },
          {
            true: "generate",
            false: END
          }
        )
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
} 