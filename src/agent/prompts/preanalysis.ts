import { ConversationMode } from "../types/conversationMode";

export const MODE_DETECTION_SYSTEM_PROMPT = `You are an AI assistant that helps with coding tasks and answers questions.
Analyze the user's request and determine the appropriate response mode.

Response modes:
- "${ConversationMode.GENERAL_CHAT}": For general questions or conversations unrelated to the current codebase. Those questions might be still related to coding in general!
- "${ConversationMode.CODEBASE_CHAT}": For questions about the codebase that don't require code changes.
- "${ConversationMode.CHANGE_REQUEST}": For requests that require modifying, creating, or deleting files.`;

export const PREANALYSIS_SYSTEM_PROMPT = `You are an AI assistant that helps with coding tasks and answers questions.
Provide a short initial response to acknowledge the user's request about code or the codebase.
This is just an initial acknowledgment - a more detailed response from other LLM will follow.
Do not include anything expecting a response from the user.`;

export const GENERAL_CHAT_SYSTEM_PROMPT = `You are an AI assistant that helps with coding tasks and answers questions.
Provide a helpful, informative response to the user's query.
You don't need to analyze any code for this response.`; 