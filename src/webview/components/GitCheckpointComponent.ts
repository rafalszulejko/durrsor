import { MessageComponent } from './MessageComponent';
import { GitCheckpointMessage } from '../messages/GitCheckpointMessage';

export class GitCheckpointComponent extends MessageComponent {
  protected override message: GitCheckpointMessage;

  constructor(message: GitCheckpointMessage) {
    super(message);
    this.message = message;
  }
  
  render(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'message tool-message file-tool';
    
    // Create a single row frame
    const frameElement = document.createElement('div');
    frameElement.className = 'tool-frame';
    
    // Add tool name
    const toolNameElement = document.createElement('span');
    toolNameElement.className = 'tool-name';
    toolNameElement.textContent = 'Git checkpoint';
    
    // Add commit hash (truncated)
    const commitHashElement = document.createElement('span');
    commitHashElement.className = 'file-path';
    const commitHash = String(this.message.content);
    commitHashElement.textContent = commitHash.substring(0, 7); // Show first 7 characters of commit hash
    
    // Add restore label (styled like tool-name with file-path hover)
    const restoreLabel = document.createElement('span');
    restoreLabel.className = 'tool-name restore-label';
    restoreLabel.textContent = 'Restore';
    restoreLabel.style.cursor = 'pointer';
    restoreLabel.onclick = () => {
      // Dispatch a custom event with the commit hash and element reference
      const event = new CustomEvent('git-checkpoint-restore', {
        detail: { 
          commitHash: this.message.content,
          element: element
        }
      });
      document.dispatchEvent(event);
    };
    
    // Assemble the frame
    frameElement.appendChild(toolNameElement);
    frameElement.appendChild(commitHashElement);
    frameElement.appendChild(restoreLabel);
    
    element.appendChild(frameElement);
    
    return element;
  }
} 