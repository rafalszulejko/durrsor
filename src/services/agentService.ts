import { ChatOpenAI } from "@langchain/openai";
import { CodeAgent } from '../agent/agent';
import { GraphStateType } from '../agent/graphState';
import * as vscode from 'vscode';
import { LogService, LogLevel } from './logService';
import { BaseMessage, HumanMessage, SystemMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { GitService } from '../agent/utils/git';
import { v4 as uuidv4 } from "uuid";
import { ModelProvider } from '../agent/utils/modelProvider';

export class AgentService {
  private agent: CodeAgent;
  private logService: LogService;
  private _onMessageReceived = new vscode.EventEmitter<BaseMessage>();
  public readonly onMessageReceived = this._onMessageReceived.event;
  private _onMessageChunkReceived = new vscode.EventEmitter<{content: string, id: string}>();
  public readonly onMessageChunkReceived = this._onMessageChunkReceived.event;
  
  constructor(logService: LogService) {
    this.logService = logService;
    this.agent = new CodeAgent(logService);
  }
  
  /**
   * Process a user prompt and selected files
   * 
   * @param prompt User's prompt
   * @param selectedFiles Array of selected file paths
   * @param threadId Optional thread ID for continuing a conversation
   * @returns Agent response
   */
  async processPrompt(
    prompt: string,
    selectedFiles: string[] = [],
    threadId?: string
  ): Promise<GraphStateType> {
    this.logService.internal(`Processing prompt: ${prompt}`);
    this.logService.internal(`Selected files: ${selectedFiles}`);
    
    // Create or use existing thread ID and Git branch
    if (!threadId) {
      threadId = uuidv4();
      // Create new branch for this thread
      this.logService.internal(`Creating branch for thread: ${threadId}`);
      await GitService.createAndCheckoutBranch(threadId);
    }
    
    // Create a human message
    const message = new HumanMessage(prompt);
    
    // Emit the message for UI display
    this._onMessageReceived.fire(message);
    
    try {
      // Stream events from the agent execution
      try {
        for await (const event of this.agent.streamEvents(prompt, selectedFiles, threadId)) {
          try {
            // Handle different event types
            if (event.event === "on_chat_model_start") {
              // LLM is starting to generate
              this.logService.internal(`LLM starting: ${event.name}`);
            }
            else if (event.event === "on_chat_model_stream") {
              // This is a token from an LLM
              if (event.data && event.data.chunk) {
                const chunk = event.data.chunk;
                // Emit the chunk for UI updates
                this._onMessageChunkReceived.fire({
                  content: typeof chunk.content === 'string' ? chunk.content : "",
                  id: chunk.id || ""
                });
              }
            }
            else if (event.event === "on_chat_model_end") {
              // LLM has finished generating
              this.logService.internal(`LLM finished: ${event.name}`);
            }
            else if (event.event === "on_tool_end") {
              // Tool has finished execution
              const kwargs = event.data.output.lc_kwargs;
              const toolMessage = new ToolMessage({
                content: event.data.output.lc_kwargs.content,
                tool_call_id: event.data.output.lc_kwargs.tool_call_id,
                name: event.data.output.lc_kwargs.name,
                additional_kwargs: event.data.output.lc_kwargs.additional_kwargs,
                response_metadata: event.data.output.lc_kwargs.response_metadata
                });
                this._onMessageReceived.fire(toolMessage);
              
            }
            else if (event.event === "on_chain_start") {
              // Node is starting execution
              if (event.name !== "LangGraph" && event.name !== "__start__") {
                this.logService.internal(`Starting node: ${event.name}`);
              }
            }
            else if (event.event === "on_chain_end") {
              // Node has finished execution
              if (event.name !== "LangGraph" && event.name !== "__start__") {
                this.logService.internal(`Finished node: ${event.name}`);
              }
            }
            else if (event.event === "on_chain_stream") {
              // Node has produced a partial result
              if (event.name !== "LangGraph") {
                this.logService.internal(`Node update: ${event.name}`);
              }
            }
          } catch (eventError) {
            // Log the error but continue processing events
            this.logService.internal(`Error processing event: ${eventError}`);
          }
        }
      } catch (streamError) {
        // Log the streaming error but continue to get the final state
        this.logService.internal(`Error streaming events: ${streamError}`);
        
        // If streaming fails, fall back to regular invoke
        await this.agent.invoke(prompt, selectedFiles, threadId);
      }
      
      // Get the final state
      const result = await this.agent.getState(threadId);
      
      if (!result) {
        throw new Error("Failed to get final state after agent execution");
      }
      
      // If files were modified, generate diff, commit message, and commit the changes
      if (result.files_modified && result.files_modified.length > 0) {
        // Generate diff
        const diff = await GitService.diff();
        
        // Commit changes
        const commitHash = await this.commitChanges(result, diff);
        
        // Add diff and commit hash to result
        result.diff = diff;
        result.commit_hash = commitHash;
      }
      
      return result;
    } catch (error: unknown) {
      // Log the error
      this.logService.internal(`Error invoking agent: ${error}`);
      
      // Emit an error message to the UI
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._onMessageReceived.fire(new SystemMessage(`Error: ${errorMessage}`));
      
      throw error;
    }
  }
  
  /**
   * Generate a commit message and commit changes
   * 
   * @param state The graph state with files_modified
   * @param diff The diff of the changes
   * @returns The commit hash
   */
  private async commitChanges(state: GraphStateType, diff: string): Promise<string> {
    this.logService.thinking("Generating commit message...");
    
    // Get the model provider instance
    const modelProvider = ModelProvider.getInstance();
    
    // Initialize the model
    const model = modelProvider.getBigModel(0, false);
    
    // Get the user message that initiated the changes
    const userMessages = state.messages.filter(msg => msg._getType() === 'human');
    const latestUserMessage = userMessages[userMessages.length - 1];
    
    // Generate commit message
    const commitMsgResponse = await model.invoke([
      new SystemMessage("You are an expert at summarizing code changes. Summarize the changes made in the following diff."),
      new SystemMessage(`User request: ${latestUserMessage.content}`),
      new SystemMessage(`\`\`\`\n${diff}\n\`\`\``)
    ]);
    
    this.logService.thinking(`Commit message: ${commitMsgResponse.content}`);
    
    // Convert MessageContent to string
    const commitMessage = typeof commitMsgResponse.content === 'string' 
      ? commitMsgResponse.content 
      : JSON.stringify(commitMsgResponse.content);
    
    // Commit the changes
    const commitHash = await GitService.addAllAndCommit(commitMessage);
    
    return commitHash;
  }
  
  /**
   * Squash and merge changes from a thread branch to the parent branch.
   * 
   * @param threadId The thread ID
   * @param commitMessage Optional custom commit message
   * @returns Result of the squash merge operation
   */
  async squashAndMergeToParent(threadId: string, commitMessage?: string): Promise<string> {
    const currentBranch = await GitService.getCurrentBranch();
    const parentBranch = currentBranch.replace(`durrsor-${threadId}`, '');
    return await GitService.squashAndMergeToBranch(parentBranch, commitMessage);
  }
} 