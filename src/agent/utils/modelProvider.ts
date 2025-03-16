import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import * as vscode from 'vscode';

export enum BigModel {
  GPT_4O = 'gpt-4o'
}

export enum SmallModel {
  GPT_4O_MINI = 'gpt-4o-mini'
}

export class ModelProvider {
  private static instance: ModelProvider;
  
  private selectedBigModel: BigModel = BigModel.GPT_4O;
  private selectedSmallModel: SmallModel = SmallModel.GPT_4O_MINI;
  
  private apiKey: string = '';
  
  private constructor() {
    this.loadConfig();
  }
  
  public static getInstance(): ModelProvider {
    if (!ModelProvider.instance) {
      ModelProvider.instance = new ModelProvider();
    }
    return ModelProvider.instance;
  }
  
  private loadConfig(): void {
    const config = vscode.workspace.getConfiguration('durrsor');
    
    this.apiKey = config.get<string>('apiKey') || process.env.OPENAI_API_KEY || '';
    
    const configBigModel = config.get<string>('bigModel');
    if (configBigModel) {
      const isValidBigModel = Object.values(BigModel).includes(configBigModel as BigModel);
      if (isValidBigModel) {
        this.selectedBigModel = configBigModel as BigModel;
      } else {
        console.warn(`Invalid big model configured: ${configBigModel}. Using default: ${this.selectedBigModel}`);
      }
    }
    
    const configSmallModel = config.get<string>('smallModel');
    if (configSmallModel) {
      const isValidSmallModel = Object.values(SmallModel).includes(configSmallModel as SmallModel);
      if (isValidSmallModel) {
        this.selectedSmallModel = configSmallModel as SmallModel;
      } else {
        console.warn(`Invalid small model configured: ${configSmallModel}. Using default: ${this.selectedSmallModel}`);
      }
    }
  }
  
  /**
   * Get a high-capability model
   * 
   * @param temperature Temperature setting for the model (0-1)
   * @param streaming Whether to enable streaming responses
   * @returns A BaseChatModel instance
   */
  public getBigModel(temperature: number = 0, streaming: boolean = true): BaseChatModel {
    // Currently only supporting OpenAI models
    // Will be extended to support other providers in the future
    return new ChatOpenAI({
      modelName: this.selectedBigModel,
      temperature,
      apiKey: this.apiKey,
      streaming
    });
  }
  
  /**
   * Get a smaller, faster model
   * 
   * @param temperature Temperature setting for the model (0-1)
   * @param streaming Whether to enable streaming responses
   * @returns A BaseChatModel instance
   */
  public getSmallModel(temperature: number = 0, streaming: boolean = true): BaseChatModel {
    // Currently only supporting OpenAI models
    // Will be extended to support other providers in the future
    return new ChatOpenAI({
      modelName: this.selectedSmallModel,
      temperature,
      apiKey: this.apiKey,
      streaming
    });
  }
  
  /**
   * Refresh configuration from VSCode settings
   * Call this method when settings might have changed
   */
  public refreshConfiguration(): void {
    this.loadConfig();
  }
  
  /**
   * Get the current big model name
   */
  public getBigModelName(): string {
    return this.selectedBigModel;
  }
  
  /**
   * Get the current small model name
   */
  public getSmallModelName(): string {
    return this.selectedSmallModel;
  }
} 