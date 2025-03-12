import { HumanMessage } from '@langchain/core/messages';
import { MessageComponent } from './MessageComponent';

export class HumanMessageComponent extends MessageComponent {
  private selectedFiles: string[];
  
  constructor(message: HumanMessage, selectedFiles: string[]) {
    super(message);
    this.selectedFiles = selectedFiles;
  }
  
  render(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'message human-message';
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.textContent = String(this.message.content);
    
    element.appendChild(contentElement);
    
    // Add selected files if available
    if (this.selectedFiles.length > 0) {
      const filesElement = document.createElement('div');
      filesElement.className = 'files';
      
      this.selectedFiles.forEach(file => {
        const fileChip = document.createElement('span');
        fileChip.className = 'file-chip';
        fileChip.textContent = file;
        filesElement.appendChild(fileChip);
      });
      
      element.appendChild(filesElement);
    }
    
    return element;
  }
} 