import { ToolMessage } from '@langchain/core/messages';
import { MessageComponent } from './MessageComponent';

export class GenericToolComponent extends MessageComponent {
  render(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'message tool-message generic-tool';
    
    const toolMessage = this.message as ToolMessage;
    const toolName = toolMessage.name || 'Tool';
    
    const headerElement = document.createElement('div');
    headerElement.className = 'tool-header';
    headerElement.innerHTML = `<span class="tool-icon">🔧</span> <span class="tool-name">${toolName}</span>`;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'tool-content';
    contentElement.innerHTML = this.renderMarkdown(String(this.message.content));
    
    element.appendChild(headerElement);
    element.appendChild(contentElement);
    
    return element;
  }
} 