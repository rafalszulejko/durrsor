import { CodeAgent } from '../agent/agent';
import { GraphStateType } from '../agent/graphState';
import * as vscode from 'vscode';

export class AgentService {
  private agent: CodeAgent;
  private apiKey: string;
  
  constructor() {
    this.agent = new CodeAgent();
    
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
    return await this.agent.invokeWithHistory(
      prompt,
      selectedFiles,
      previousState?.thread_id,
      previousState
    );
  }

  async processPrompt(prompt: string, files: string[]): Promise<any> {
    // Here you would use the API key for your AI operations
    console.log(`Processing prompt with API key: ${this.apiKey ? 'Available' : 'Not available'}`);
    
    // Your implementation here
    return {
      response: `Processed prompt: ${prompt}`,
      files: files
    };
  }
} 