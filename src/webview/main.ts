// Import required libraries
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import 'highlight.js/styles/vs2015.css';
import { 
  BaseMessage, 
  HumanMessage, 
  AIMessage, 
  SystemMessage, 
  ToolMessage, 
  AIMessageChunk 
} from '@langchain/core/messages';
import { 
  isAIMessage, 
  isHumanMessage, 
  isToolMessage, 
  isSystemMessage 
} from '@langchain/core/messages';

// Import components
import {
  HumanMessageComponent,
  AIMessageComponent,
  GenericMessageComponent,
  GenericToolComponent,
  EditFileToolComponent,
  ReadFileToolComponent,
  LogMessageComponent
} from './components';

// Import utils
import { reconstructMessage } from './utils';

// Declare the VS Code API
declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
};

// Message chunk interface
interface MessageChunk {
  content: string;
  id: string;
}

// Log interface
interface Log {
  level: string;
  message: string;
  isNewType?: boolean;
}

// Initialize webview
(function() {
  // Get VS Code API
  const vscode = acquireVsCodeApi();
  
  // Initialize markdown-it
  const md = MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: function (str: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(str, { language: lang }).value;
        } catch (error) {
          console.error('Error highlighting code:', error);
        }
      }
      return ''; // use external default escaping
    }
  });
  
  // DOM elements
  const chatContainer = document.getElementById('chatContainer');
  const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement;
  const sendButton = document.getElementById('sendButton');
  const selectFilesButton = document.getElementById('selectFilesButton');
  const selectedFilesContainer = document.getElementById('selectedFiles');
  const loadingIndicator = document.getElementById('loadingIndicator');
  
  // State
  let selectedFiles: string[] = [];
  let isLoading = false;
  
  // Map to track streaming message elements by ID
  const streamingMessages = new Map<string, HTMLElement>();
  
  // Event listeners
  sendButton?.addEventListener('click', sendPrompt);
  promptInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });
  
  selectFilesButton?.addEventListener('click', () => {
    vscode.postMessage({ command: 'selectFiles' });
  });
  
  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    
    switch (message.command) {
      case 'message':
        if (message.messageData) {
          // Reconstruct the proper message class instance
          const reconstructedMessage = reconstructMessage(message.messageData);
          handleMessage(reconstructedMessage);
        }
        break;
      case 'messageChunk':
        if (message.chunkData) {
          handleMessageChunk(message.chunkData);
        }
        break;
      case 'log':
        handleLog(message.level, message.message, message.isNewType);
        break;
      case 'selectedFiles':
        updateSelectedFiles(message.files);
        break;
      case 'showLoading':
        showLoadingIndicator();
        break;
      case 'hideLoading':
        hideLoadingIndicator();
        break;
    }
  });
  
  // Functions
  function sendPrompt() {
    if (!promptInput || isLoading) {
      return;
    }
    
    const prompt = promptInput.value.trim();
    if (!prompt) {
      return;
    }
    
    // Send to extension - the human message will be sent back via the message event
    vscode.postMessage({
      command: 'sendPrompt',
      prompt,
      selectedFiles
    });
    
    // Clear input
    promptInput.value = '';
  }
  
  function handleMessage(message: BaseMessage) {

    // For AI messages that are being streamed, we may already have a placeholder element
    if (isAIMessage(message) && message.id && streamingMessages.has(message.id)) {
      // The message is complete, but we've already been rendering it via chunks
      // Just ensure it's fully up to date
      const existingElement = streamingMessages.get(message.id)!;
      const contentElement = existingElement.querySelector('.message-content');
      if (contentElement) {
        contentElement.innerHTML = md.render(String(message.content));
      }
      
      // Remove from streaming messages map
      streamingMessages.delete(message.id);
      return;
    }
    
    // Create the appropriate component based on message type
    let messageComponent;
    if (isHumanMessage(message)) {
      messageComponent = new HumanMessageComponent(message, selectedFiles);
    } 
    else if (isAIMessage(message)) {
      messageComponent = new AIMessageComponent(message);
    }
    else if (isToolMessage(message)) {
      // Determine which tool component to use based on the tool name
      // Access tool_call_id which is guaranteed to exist on ToolMessage
      const toolMessage = message as ToolMessage;
      const toolName = toolMessage.name || 'generic';
      
      switch (toolName) {
        case 'read_file_tool':
          messageComponent = new ReadFileToolComponent(message);
          break;
        case 'edit_tool':
          messageComponent = new EditFileToolComponent(message);
          break;
        default:
          messageComponent = new GenericToolComponent(message);
          break;
      }
    }
    else if (isSystemMessage(message)) {
      messageComponent = new GenericMessageComponent(message);
    }
    else {
      // Default case for any other message types
      messageComponent = new GenericMessageComponent(message);
    }
    
    // Render the component and add it to the chat container
    const element = messageComponent.render();
    chatContainer?.appendChild(element);
    scrollToBottom();
  }
  
  function handleMessageChunk(chunk: MessageChunk) {
    // If this is the first chunk for this message, create a new message element
    if (!streamingMessages.has(chunk.id)) {
      // Create a new AI message component with empty content
      const message = new AIMessage({
        content: '',
        id: chunk.id
      });
      
      const messageComponent = new AIMessageComponent(message);
      const element = messageComponent.render();
      
      // Add to the chat container
      chatContainer?.appendChild(element);
      
      // Store in the streaming messages map
      streamingMessages.set(chunk.id, element);
    }
    
    // Update the existing message with the new chunk content
    const existingElement = streamingMessages.get(chunk.id)!;
    const contentElement = existingElement.querySelector('.message-content');
    
    if (contentElement) {
      // Append the new content
      const currentContent = contentElement.getAttribute('data-raw-content') || '';
      const newContent = currentContent + chunk.content;
      
      // Update the raw content attribute
      contentElement.setAttribute('data-raw-content', newContent);
      
      // Update the rendered content
      contentElement.innerHTML = md.render(newContent);
    }
    
    // Mark the message as streaming
    existingElement.setAttribute('data-streaming', 'true');
    
    scrollToBottom();
  }
  
  function handleLog(level: string, message: string, isNewType?: boolean) {
    // Skip internal messages
    if (level === 'internal') {
      return;
    }
    
    // Create a log message component and add it to the chat
    const logComponent = new LogMessageComponent(level, message, isNewType);
    const element = logComponent.render();
    chatContainer?.appendChild(element);
    scrollToBottom();
  }
  
  function updateSelectedFiles(files: string[]) {
    selectedFiles = files;
    
    // Update UI
    if (selectedFilesContainer) {
      selectedFilesContainer.innerHTML = '';
    
      files.forEach(file => {
        const fileChip = document.createElement('span');
        fileChip.className = 'file-chip';
        fileChip.textContent = file;
        
        const removeButton = document.createElement('button');
        removeButton.className = 'remove-file';
        removeButton.textContent = '×';
        removeButton.addEventListener('click', () => {
          selectedFiles = selectedFiles.filter(f => f !== file);
          updateSelectedFiles(selectedFiles);
        });
        
        fileChip.appendChild(removeButton);
        selectedFilesContainer.appendChild(fileChip);
      });
    }
  }
  
  function showLoadingIndicator() {
    isLoading = true;
    
    // Show the dedicated loading indicator
    loadingIndicator?.classList.add('visible');
  }
  
  function hideLoadingIndicator() {
    isLoading = false;
    
    // Hide the dedicated loading indicator
    loadingIndicator?.classList.remove('visible');
  }
  
  function scrollToBottom() {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }
})(); 