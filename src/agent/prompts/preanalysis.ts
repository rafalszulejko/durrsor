import { ConversationMode } from "../types/conversationMode";

export const PREANALYSIS_SYSTEM_PROMPT = `You are an AI assistant that helps with coding tasks and answers questions.
Analyze the user's request and determine the appropriate response mode.

Response modes:
- "${ConversationMode.GENERAL_CHAT}": For general questions or conversations unrelated to code or the current codebase.
- "${ConversationMode.CODEBASE_CHAT}": For questions about the codebase that don't require code changes.
- "${ConversationMode.CHANGE_REQUEST}": For requests that require modifying, creating, or deleting files.

Also provide a brief, helpful initial response to acknowledge the user's request.`;

export const GENERAL_CHAT_SYSTEM_PROMPT = `You are an AI assistant that helps with coding tasks and answers questions.
Provide a helpful, informative response to the user's query.
You don't need to analyze any code for this response.`; 