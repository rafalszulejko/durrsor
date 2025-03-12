import { AIMessage } from '@langchain/core/messages';
import { MessageComponent } from './MessageComponent';

export class AIMessageComponent extends MessageComponent {
  render(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'message ai-message';
    
    // Add message ID as data attribute if available
    if (this.message.id) {
      element.setAttribute('data-message-id', this.message.id);
    }
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    
    // Store the raw content for streaming updates
    contentElement.setAttribute('data-raw-content', String(this.message.content));
    
    // Render the content
    contentElement.innerHTML = this.renderMarkdown(String(this.message.content));
    
    element.appendChild(contentElement);
    
    return element;
  }
} 