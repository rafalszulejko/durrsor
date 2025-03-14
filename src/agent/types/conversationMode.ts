/**
 * Enum defining the possible conversation modes for the agent.
 */
export enum ConversationMode {
  /**
   * General chat mode for conversations unrelated to the codebase.
   * This mode will bypass code analysis and generation.
   */
  GENERAL_CHAT = "general_chat",
  
  /**
   * Codebase chat mode for questions about the codebase.
   * This mode will analyze the codebase but not make changes.
   */
  CODEBASE_CHAT = "codebase_chat",
  
  /**
   * Change request mode for making changes to the codebase.
   * This mode will analyze the codebase and generate code changes.
   */
  CHANGE_REQUEST = "change_request"
} 