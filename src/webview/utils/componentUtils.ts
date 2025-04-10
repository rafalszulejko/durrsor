import { 
  BaseMessage, 
  ToolMessage 
} from '@langchain/core/messages';
import { 
  isAIMessage, 
  isHumanMessage, 
  isToolMessage, 
  isSystemMessage 
} from '@langchain/core/messages';

import {
  HumanMessageComponent,
  AIMessageComponent,
  GenericMessageComponent,
  GenericToolComponent,
  FileToolComponent
} from '../components';

/**
 * Returns the appropriate component for a given message
 * @param message The message to create a component for
 * @param selectedFiles Optional array of selected files (needed for HumanMessageComponent)
 * @returns The appropriate message component instance
 */
export function getComponentForMessage(message: BaseMessage, selectedFiles?: string[]) {
  if (isHumanMessage(message)) {
    return new HumanMessageComponent(message, selectedFiles || []);
  } 
  else if (isAIMessage(message)) {
    return new AIMessageComponent(message);
  }
  else if (isToolMessage(message)) {
    // Determine which tool component to use based on the tool name
    const toolMessage = message as ToolMessage;
    const toolName = toolMessage.name || 'generic';
    
    switch (toolName) {
      case 'read_file_tool':
        return new FileToolComponent(message, 'Read file');
      case 'list_dir_tool':
        return new FileToolComponent(message, 'List directory');
      case 'search_file_tool':
        return new FileToolComponent(message, 'File search');
      case 'edit_tool':
      case 'replace_file_tool':
        return new FileToolComponent(message, 'Apply changes');
      case 'create_file':
        return new FileToolComponent(message, 'Create file');
      default:
        return new GenericToolComponent(message);
    }
  }
  else if (isSystemMessage(message)) {
    return new GenericMessageComponent(message);
  }
  else {
    // Default case for any other message types
    return new GenericMessageComponent(message);
  }
} 