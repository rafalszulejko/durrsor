import { MessageComponent } from './MessageComponent';

export class ReadFileToolComponent extends MessageComponent {
  render(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'message tool-message read-file-tool';
    
    // Parse the content as JSON
    let filePath = 'Unknown file';
    let success = false;
    
    try {
      const contentObj = JSON.parse(String(this.message.content));
      filePath = contentObj.filePath || 'Unknown file';
      success = Boolean(contentObj.success);
    } catch (e) {
      console.error('Failed to parse ReadFileToolComponent content as JSON', e);
    }
    
    // Create a single row frame
    const frameElement = document.createElement('div');
    frameElement.className = 'tool-frame';
    
    // Add tool name
    const toolNameElement = document.createElement('span');
    toolNameElement.className = 'tool-name';
    toolNameElement.textContent = 'Read file';
    
    // Add file path
    const filePathElement = document.createElement('span');
    filePathElement.className = 'file-path';
    filePathElement.textContent = filePath;
    
    // Add success/failure icon
    const statusElement = document.createElement('span');
    statusElement.className = 'tool-status';
    statusElement.innerHTML = success ? '✓' : '𐄂';
    
    // Assemble the frame
    frameElement.appendChild(toolNameElement);
    frameElement.appendChild(filePathElement);
    frameElement.appendChild(statusElement);
    
    element.appendChild(frameElement);
    
    return element;
  }
} 