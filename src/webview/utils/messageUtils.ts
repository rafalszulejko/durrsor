import { 
  BaseMessage, 
  HumanMessage, 
  AIMessage, 
  SystemMessage, 
  ToolMessage, 
  AIMessageChunk 
} from '@langchain/core/messages';

/**
 * Reconstructs message class instances from serialized data
 * @param messageData The serialized message data
 * @returns A properly typed BaseMessage instance
 */
export function reconstructMessage(messageData: any): BaseMessage {
  const { type, content, name, additional_kwargs, id, tool_call_id } = messageData;
  
  switch(type) {
    case 'human': 
      return new HumanMessage({ content, name, additional_kwargs, id });
    case 'ai': 
      return new AIMessage({ content, name, additional_kwargs, id });
    case 'system': 
      return new SystemMessage({ content, name, additional_kwargs, id });
    case 'tool': 
      return new ToolMessage({
        content,
        name,
        tool_call_id,
        additional_kwargs,
        id
      });
    case 'ai_chunk':
      return new AIMessageChunk({ content, name, additional_kwargs, id });
    default: 
      console.warn(`Unknown message type: ${type}`);
      // Create a generic BaseMessage for unknown types
      return new HumanMessage({ content, name: name || type, additional_kwargs, id });
  }
} 