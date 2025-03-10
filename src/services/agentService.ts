import { ChatOpenAI } from "@langchain/openai";
import { CodeAgent } from '../agent/agent';
import { GraphStateType } from '../agent/graphState';
import * as vscode from 'vscode';
import { LogService, LogLevel } from './logService';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { GitService } from '../agent/utils/git';
import { v4 as uuidv4 } from "uuid";

export class AgentService {
  private agent: CodeAgent;
  private apiKey: string;
  private logService: LogService;
  private _onMessageReceived = new vscode.EventEmitter<BaseMessage>();
  public readonly onMessageReceived = this._onMessageReceived.event;
  
  constructor(logService: LogService) {
    this.logService = logService;
    this.agent = new CodeAgent(logService);
    
    // Get API key from extension settings
    const config = vscode.workspace.getConfiguration('durrsor');
    this.apiKey = config.get<string>('apiKey') || process.env.OPENAI_API_KEY || '';
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
      await this.createBranch(threadId);
    }
    
    // Create a human message
    const message = new HumanMessage(prompt);
    
    // Emit the message for UI display
    this._onMessageReceived.fire(message);
    
    // Patch the console.log function to use our logService
    const originalConsoleLog = console.log;
    console.log = (...args: any[]) => {
      // Call the original console.log
      originalConsoleLog(...args);
      
      // Convert args to string
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      // Determine log level based on message content
      if (message.includes('[INTERNAL]') || message.includes('[THINKING]') || message.includes('[PUBLIC]')) {
        // Already formatted by our logger, ignore to avoid duplication
        return;
      } else if (message.startsWith('```') || message.includes('diff --git')) {
        // Code blocks or diffs are likely public output
        this.logService.public(message);
      } else if (
        message.includes('agent messages:') || 
        message.includes('msg:') || 
        message.includes('commit_msg:') ||
        message.includes('refined_response:')
      ) {
        // Agent thinking process
        this.logService.thinking(message);
      } else if (message.includes('selected_files:')) {
        // File selection is useful for the user to see
        this.logService.thinking(message);
      } else if (message.includes('response:')) {
        // LLM responses are important
        this.logService.thinking(message);
      } else if (message.includes('diff:')) {
        // Diffs are important to show
        this.logService.public(message);
      } else {
        // Default to internal logging
        this.logService.internal(message);
      }
    };
    
    try {
      // Invoke the agent
      const result = await this.agent.invoke(
        prompt,
        selectedFiles,
        threadId
      );
      
      // Restore original console.log
      console.log = originalConsoleLog;
      
      // If files were modified, generate diff, commit message, and commit the changes
      if (result.files_modified && result.files_modified.length > 0) {
        // Generate diff
        const diff = await this.generateDiff();
        
        // Display diff
        this.logService.public(`Changes made:`);
        this.logService.diff(diff);
        
        // Commit changes
        const commitHash = await this.commitChanges(result, diff);
        
        // Add diff and commit hash to result
        result.diff = diff;
        result.commit_hash = commitHash;
      }
      
      // Emit all new messages for UI display
      if (result.messages) {
        // Get the new messages (those added during this invocation)
        const state = await this.agent.getState(threadId);
        if (state && state.messages) {
          // Emit each message that wasn't emitted before
          // This is a simplified approach - in a real implementation,
          // you'd need to track which messages have already been emitted
          const newMessages = state.messages.slice(-2); // Assuming at most 2 new messages
          for (const msg of newMessages) {
            if (msg._getType() !== 'human') { // Don't re-emit the human message
              this._onMessageReceived.fire(msg);
            }
          }
        }
      }
      
      return result;
    } catch (error) {
      // Restore original console.log
      console.log = originalConsoleLog;
      
      // Log the error
      this.logService.internal(`Error invoking agent: ${error}`);
      throw error;
    }
  }
  
  /**
   * Create a new Git branch for a thread
   * 
   * @param threadId The thread ID
   */
  private async createBranch(threadId: string): Promise<void> {
    this.logService.internal(`Creating branch for thread: ${threadId}`);
    await GitService.createAndCheckoutBranch(threadId);
  }
  
  /**
   * Generate a diff of the current changes
   * 
   * @returns The diff as a string
   */
  private async generateDiff(): Promise<string> {
    return await GitService.diff();
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
    
    // Initialize the model
    const model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0,
      apiKey: this.apiKey
    });
    
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
    this.logService.public(`Changes committed with message: ${commitMessage}`);
    
    return commitHash;
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
   * Get the history of states for a thread
   * 
   * @param threadId The thread ID
   * @returns The history of states for the thread
   */
  async getStateHistory(threadId: string): Promise<GraphStateType[]> {
    return await this.agent.getStateHistory(threadId);
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
  
  /**
   * Legacy method for backward compatibility
   * @deprecated Use processPrompt instead
   */
  async invokeAgent(
    prompt: string,
    selectedFiles: string[],
    previousState?: GraphStateType
  ): Promise<GraphStateType> {
    const threadId = previousState?.thread_id || uuidv4();
    return this.processPrompt(prompt, selectedFiles, threadId);
  }
} 