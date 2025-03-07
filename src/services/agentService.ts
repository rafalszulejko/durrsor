import { CodeAgent } from '../agent/agent';
import { GraphStateType } from '../agent/graphState';
import * as vscode from 'vscode';
import { LogService, LogLevel } from './logService';

export class AgentService {
  private agent: CodeAgent;
  private apiKey: string;
  private logService: LogService;
  
  constructor(logService: LogService) {
    this.logService = logService;
    this.agent = new CodeAgent(logService);
    
    // Get API key from extension settings
    const config = vscode.workspace.getConfiguration('durrsor');
    this.apiKey = config.get<string>('apiKey') || process.env.OPENAI_API_KEY || '';
  }
  
  /**
   * Invoke the agent with a prompt and selected files
   * 
   * @param prompt User's prompt
   * @param selectedFiles Array of selected file paths
   * @param previousState Previous state from last invocation
   * @returns Agent response
   */
  async invokeAgent(
    prompt: string,
    selectedFiles: string[],
    previousState?: GraphStateType
  ): Promise<GraphStateType> {
    this.logService.internal(`Invoking agent with prompt: ${prompt}`);
    this.logService.internal(`Selected files: ${selectedFiles}`);
    this.logService.internal(`Previous state: ${previousState ? JSON.stringify(previousState) : 'None'}`);
    
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
      const result = await this.agent.invokeWithHistory(
        prompt,
        selectedFiles,
        previousState?.thread_id,
        previousState
      );
      
      // Restore original console.log
      console.log = originalConsoleLog;
      
      return result;
    } catch (error) {
      // Restore original console.log
      console.log = originalConsoleLog;
      
      // Log the error
      this.logService.internal(`Error invoking agent: ${error}`);
      throw error;
    }
  }

  async processPrompt(prompt: string, files: string[]): Promise<any> {
    // Here you would use the API key for your AI operations
    this.logService.internal(`Processing prompt with API key: ${this.apiKey ? 'Available' : 'Not available'}`);
    
    // Your implementation here
    return {
      response: `Processed prompt: ${prompt}`,
      files: files
    };
  }
} 