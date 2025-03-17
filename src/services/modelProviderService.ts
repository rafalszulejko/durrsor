import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BedrockChat } from "@langchain/community/chat_models/bedrock";
import * as vscode from 'vscode';

export enum BigModel {
  GPT_4O = 'gpt-4o',
  CLAUDE_3_5_SONNET = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  CLAUDE_3_7_SONNET = 'anthropic.claude-3-7-sonnet-20250219-v1:0'
}

export enum SmallModel {
  GPT_4O_MINI = 'gpt-4o-mini',
  CLAUDE_3_5_HAIKU = 'anthropic.claude-3-5-haiku-20241022-v1:0'
}

export enum ModelProvider {
  OPENAI = 'openai',
  BEDROCK = 'bedrock'
}

interface ModelMapping {
  provider: ModelProvider;
  modelId?: string; // For Bedrock models that need a specific modelId
}

export class ModelProviderService {
  private static instance: ModelProviderService;
  
  private selectedBigModel: BigModel = BigModel.GPT_4O;
  private selectedSmallModel: SmallModel = SmallModel.GPT_4O_MINI;
  
  // API keys and configuration
  private apiKeyOpenAI: string = '';
  private awsRegion: string = '';
  private amazonBedrockAccessKey: string = '';
  private amazonBedrockSecretAccessKey: string = '';
  
  // Model mapping to determine which provider to use for each model
  private modelMapping: Record<string, ModelMapping> = {
    [BigModel.GPT_4O]: { provider: ModelProvider.OPENAI },
    [SmallModel.GPT_4O_MINI]: { provider: ModelProvider.OPENAI },
    [BigModel.CLAUDE_3_5_SONNET]: { 
      provider: ModelProvider.BEDROCK,
      modelId: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
    },
    [BigModel.CLAUDE_3_7_SONNET]: { 
      provider: ModelProvider.BEDROCK,
      modelId: 'anthropic.claude-3-7-sonnet-20250219-v1:0'
    },
    [SmallModel.CLAUDE_3_5_HAIKU]: { 
      provider: ModelProvider.BEDROCK,
      modelId: 'anthropic.claude-3-5-haiku-20241022-v1:0'
    }
  };
  
  private constructor() {
    this.loadConfig();
  }
  
  public static getInstance(): ModelProviderService {
    if (!ModelProviderService.instance) {
      ModelProviderService.instance = new ModelProviderService();
    }
    return ModelProviderService.instance;
  }
  
  private loadConfig(): void {
    const config = vscode.workspace.getConfiguration('durrsor');
    
    this.apiKeyOpenAI = config.get<string>('apiKeyOpenAI') || process.env.OPENAI_API_KEY || '';
    this.awsRegion = config.get<string>('awsRegion') || process.env.AWS_REGION || '';
    this.amazonBedrockAccessKey = config.get<string>('amazonBedrockAccessKey') || process.env.AWS_ACCESS_KEY_ID || '';
    this.amazonBedrockSecretAccessKey = config.get<string>('amazonBedrockSecretAccessKey') || process.env.AWS_SECRET_ACCESS_KEY || '';
    
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
    const modelConfig = this.modelMapping[this.selectedBigModel];
    
    if (!modelConfig) {
      throw new Error(`Model configuration not found for ${this.selectedBigModel}`);
    }
    
    return this.createModelInstance(
      this.selectedBigModel,
      modelConfig,
      temperature,
      streaming
    );
  }
  
  /**
   * Get a smaller, faster model
   * 
   * @param temperature Temperature setting for the model (0-1)
   * @param streaming Whether to enable streaming responses
   * @returns A BaseChatModel instance
   */
  public getSmallModel(temperature: number = 0, streaming: boolean = true): BaseChatModel {
    const modelConfig = this.modelMapping[this.selectedSmallModel];
    
    if (!modelConfig) {
      throw new Error(`Model configuration not found for ${this.selectedSmallModel}`);
    }
    
    return this.createModelInstance(
      this.selectedSmallModel,
      modelConfig,
      temperature,
      streaming
    );
  }
  
  /**
   * Create the appropriate model instance based on the provider
   */
  private createModelInstance(
    modelName: string,
    modelConfig: ModelMapping,
    temperature: number,
    streaming: boolean
  ): BaseChatModel {
    switch (modelConfig.provider) {
      case ModelProvider.OPENAI:
        if (!this.apiKeyOpenAI) {
          throw new Error('OpenAI API key is required but not configured');
        }
        return new ChatOpenAI({
          modelName,
          temperature,
          apiKey: this.apiKeyOpenAI,
          streaming
        });
        
      case ModelProvider.BEDROCK:
        if (!this.awsRegion || !this.amazonBedrockAccessKey || !this.amazonBedrockSecretAccessKey) {
          throw new Error('AWS Bedrock configuration is incomplete');
        }
        return new BedrockChat({
          model: modelConfig.modelId || modelName,
          region: this.awsRegion,
          credentials: {
            accessKeyId: this.amazonBedrockAccessKey,
            secretAccessKey: this.amazonBedrockSecretAccessKey,
          },
          temperature,
          streaming
        });
        
      default:
        throw new Error(`Unsupported model provider: ${modelConfig.provider}`);
    }
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
  
  /**
   * Check if the current configuration is valid for the selected models
   * @returns Object with validation status and any error messages
   */
  public validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check OpenAI models configuration
    const usingOpenAI = [
      this.selectedBigModel, 
      this.selectedSmallModel
    ].some(model => this.modelMapping[model]?.provider === ModelProvider.OPENAI);
    
    if (usingOpenAI && !this.apiKeyOpenAI) {
      errors.push('OpenAI API key is required for the selected model(s)');
    }
    
    // Check Bedrock models configuration
    const usingBedrock = [
      this.selectedBigModel, 
      this.selectedSmallModel
    ].some(model => this.modelMapping[model]?.provider === ModelProvider.BEDROCK);
    
    if (usingBedrock) {
      if (!this.awsRegion) {
        errors.push('AWS Region is required for Amazon Bedrock models');
      }
      if (!this.amazonBedrockAccessKey) {
        errors.push('Amazon Bedrock Access Key is required');
      }
      if (!this.amazonBedrockSecretAccessKey) {
        errors.push('Amazon Bedrock Secret Access Key is required');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
} 