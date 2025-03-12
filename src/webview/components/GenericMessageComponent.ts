import { isSystemMessage } from '@langchain/core/messages';
import { MessageComponent } from './MessageComponent';

export class GenericMessageComponent extends MessageComponent {
  render(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'message generic-message';
    
    // Add message type as a class
    if (isSystemMessage(this.message)) {
      element.classList.add('system-message');
    }
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.innerHTML = this.renderMarkdown(String(this.message.content));
    
    element.appendChild(contentElement);
    
    return element;
  }
} 