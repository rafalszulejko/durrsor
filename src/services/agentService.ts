import { ChatOpenAI } from "@langchain/openai";
import { CodeAgent } from '../agent/agent';
import { GraphStateType } from '../agent/graphState';
import * as vscode from 'vscode';
import { LogService, LogLevel } from './logService';
import { BaseMessage, HumanMessage, SystemMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { GitService } from '../agent/utils/git';
import { v4 as uuidv4 } from "uuid";
import { ModelService } from './modelService';

export class AgentService {
  private agent: CodeAgent;
  private logService: LogService;
  private _onMessageReceived = new vscode.EventEmitter<BaseMessage>();
  public readonly onMessageReceived = this._onMessageReceived.event;
  private _onMessageChunkReceived = new vscode.EventEmitter<{content: string, id: string}>();
  public readonly onMessageChunkReceived = this._onMessageChunkReceived.event;
  private commitHashToCheckpointId: Map<string, string> = new Map();
  private parentBranchMap: Map<string, string> = new Map(); // Map to store threadId to parent branch name
  private parentCommitHashMap: Map<string, string> = new Map(); // Map to store threadId to parent commit hash
  
  constructor() {
    this.logService = LogService.getInstance();
    this.agent = new CodeAgent();
  }
  
  /**
   * Save parent branch name and commit hash for a thread
   * 
   * @param threadId The thread ID to save parent info for
   * @private
   */
  private async saveParentInfo(threadId: string): Promise<void> {
    try {
      // Get the current branch name
      const parentBranch = await GitService.getCurrentBranch();
      this.logService.internal(`Saving parent branch: ${parentBranch} for thread: ${threadId}`);
      this.parentBranchMap.set(threadId, parentBranch);
      
      // Get the current HEAD commit hash
      const parentCommitHash = await GitService.getHeadCommitHash();
      this.logService.internal(`Saving parent commit hash: ${parentCommitHash} for thread: ${threadId}`);
      this.parentCommitHashMap.set(threadId, parentCommitHash);
    } catch (error) {
      this.logService.internal(`Error saving parent branch or commit hash: ${error}`);
    }
  }
  
  /**
   * Process a user prompt and selected files
   * 
   * @param prompt User's prompt
   * @param selectedFiles Array of selected file paths
   * @param threadId Optional thread ID for continuing a conversation
   * @param externalConfig Optional external configuration from a restored checkpoint
   * @returns Agent response
   */
  async processPrompt(
    prompt: string,
    selectedFiles: string[] = [],
    threadId?: string,
    externalConfig?: any
  ): Promise<GraphStateType> {
    this.logService.internal(`Processing prompt: ${prompt}`);
    this.logService.internal(`Selected files: ${selectedFiles}`);
    
    // Create or use existing thread ID and Git branch
    if (!threadId) {
      threadId = uuidv4();
      
      // Save parent branch name and commit hash before creating a new branch
      await this.saveParentInfo(threadId);
      
      // Create new branch for this thread
      this.logService.internal(`Creating branch for thread: ${threadId}`);
      await GitService.createAndCheckoutBranch(threadId);
      // Set the thread ID in the LogService
      this.logService.setThreadId(threadId);
    }
    
    // Create a human message
    const message = new HumanMessage(prompt);
    
    // Emit the message for UI display
    this._onMessageReceived.fire(message);
    
    try {
      // Stream events from the agent execution
      try {
        for await (const event of this.agent.streamEvents(prompt, selectedFiles, threadId, externalConfig)) {
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
              // LLM has finished generating, we might have non-streamed agent responses here
              this.logService.internal(`LLM finished: ${event.name}`);
              this.logService.internal(`on_chat_model_end event data: ${JSON.stringify(event.data)}`);
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
                this.logService.internal(`on_chain_start event data: ${JSON.stringify(event.data)}`);
              }
            }
            else if (event.event === "on_chain_end") {
              // Node has finished execution
              if (event.name !== "LangGraph" && event.name !== "__start__") {
                this.logService.internal(`Finished node: ${event.name}`);
                this.logService.internal(`on_chain_end event data: ${JSON.stringify(event.data)}`);
              }
            }
            else if (event.event === "on_chain_stream") {
              // Node has produced a partial result
              if (event.name !== "LangGraph") {
                this.logService.internal(`Node update: ${event.name}`);
                this.logService.internal(`on_chain_stream event data: ${JSON.stringify(event.data)}`);
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
        await this.agent.invoke(prompt, selectedFiles, threadId, externalConfig);
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
        
        // Get the latest checkpoint ID
        const checkpointId = await this.agent.getLastCheckpointId(threadId);
        if (checkpointId) {
          this.commitHashToCheckpointId.set(commitHash, checkpointId);
          this.logService.internal(`Mapped commit ${commitHash} to checkpoint ${checkpointId}`);
          this.logService.internal(`Current map state: ${JSON.stringify(Object.fromEntries(this.commitHashToCheckpointId))}`);
        }
        
        // Add diff and commit hash to result
        result.diff = diff;
        result.commit_hash = commitHash;
      }
      
      this.logService.internal(`Result: ${JSON.stringify(result)}`);

      // Save logs to file after committing changes
      await this.logService.saveLogs();

      return result;
    } catch (error: unknown) {
      // Log the error
      this.logService.internal(`Error invoking agent: ${error}`);
      
      // Emit an error message to the UI
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._onMessageReceived.fire(new SystemMessage(`Error: ${errorMessage}`));
      
      // Save logs even in case of error
      await this.logService.saveLogs();
      
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
    this.logService.internal("Generating commit message...");
    
    // Get the model provider instance
    const modelProvider = ModelService.getInstance();
    
    // Initialize the model
    const model = modelProvider.getBigModel(0, false);
    
    // Get the user message that initiated the changes
    const userMessages = state.messages.filter(msg => msg._getType() === 'human');
    const latestUserMessage = userMessages[userMessages.length - 1];
    
    // Generate commit message
    const commitMsgResponse = await model.invoke([
      new SystemMessage("You are a senior software engineer. You are given a user request and a diff of the changes made to the code. You are to generate a commit message for the changes."),
      new SystemMessage(`User request: ${latestUserMessage.content}`),
      new SystemMessage(`\`\`\`\n${diff}\n\`\`\``)
    ]);
    
    this.logService.internal(`Commit message: ${commitMsgResponse.content}`);
    
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
  async squashAndMergeToParent(threadId: string, commitMessage: string): Promise<void> {
    const parentBranch = this.parentBranchMap.get(threadId);
    if (!parentBranch) {
      throw new Error(`No parent branch found for thread: ${threadId}`);
    }
    await GitService.squashAndMergeToBranch(parentBranch, commitMessage);
  }

  /**
   * Restore the agent to a checkpoint associated with a specific commit hash
   * 
   * @param commitHash The git commit hash to restore to
   * @param threadId The thread ID for the conversation
   * @returns The updated configuration for subsequent agent operations, or null if restore failed
   */
  async restoreToCheckpoint(commitHash: string, threadId: string): Promise<any | null> {
    try {
      this.logService.internal(`Restoring agent to commit: ${commitHash}`);
      
      // Find the checkpoint ID associated with this commit hash
      const checkpointId = this.commitHashToCheckpointId.get(commitHash);
      
      if (!checkpointId) {
        this.logService.internal(`No checkpoint found for commit hash: ${commitHash}`);
        return null;
      }
      
      this.logService.internal(`Found checkpoint ID: ${checkpointId} for commit: ${commitHash}`);
      
      // Reset the agent to the checkpoint ID
      const updatedConfig = await this.agent.resetAgentToCheckpointId(threadId, checkpointId);
      
      if (!updatedConfig) {
        this.logService.internal(`Failed to reset agent to checkpoint: ${checkpointId}`);
        return null;
      }
      
      this.logService.internal(`Successfully restored agent to checkpoint for commit: ${commitHash}`);
      return updatedConfig;
    } catch (error) {
      this.logService.internal(`Error restoring to checkpoint for commit ${commitHash}: ${error}`);
      return null;
    }
  }
  
  /**
   * Get the current state for a thread
   * 
   * @param threadId The thread ID
   * @returns The current state for the thread
   */
  async getState(threadId: string): Promise<GraphStateType | null> {
    return await this.agent.getState(threadId);
  }
  
  /**
   * Accept changes by squashing and merging to parent branch
   * 
   * @param threadId The thread ID
   * @throws Error if operation fails
   */
  async acceptChanges(threadId: string): Promise<void> {
    this.logService.internal(`Accepting changes for thread: ${threadId}`);
    
    // Get parent branch and commit hash for this thread
    const parentBranch = this.parentBranchMap.get(threadId);
    const parentCommitHash = this.parentCommitHashMap.get(threadId);
    
    if (!parentBranch || !parentCommitHash) {
      throw new Error(`No parent branch or commit hash found for thread: ${threadId}`);
    }
    
    this.logService.internal(`Parent branch: ${parentBranch}, parent commit hash: ${parentCommitHash}`);
    
    // Get all commits since the parent commit
    const commits = await GitService.getCommitsSince(parentCommitHash);
    
    // Generate merge commit message by concatenating all commit messages
    let mergeCommitMessage = "Merged changes from thread: " + threadId;
    
    if (commits.length > 0) {
      mergeCommitMessage += "\n\nChanges include:\n";
      for (const commit of commits) {
        mergeCommitMessage += `- ${commit.message}\n`;
      }
    }
    
    // Squash and merge changes to parent branch
    await this.squashAndMergeToParent(threadId, mergeCommitMessage);
    
    this.logService.internal(`Successfully accepted changes for thread: ${threadId}`);
  }
} 