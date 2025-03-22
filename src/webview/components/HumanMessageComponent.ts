import { HumanMessage } from '@langchain/core/messages';
import { MessageComponent } from './MessageComponent';
import { FileChip } from './FileChip';

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
        const fileChip = new FileChip(file, () => {}, false);
        filesElement.appendChild(fileChip.render());
      });
      
      element.appendChild(filesElement);
    }
    
    return element;
  }
} 