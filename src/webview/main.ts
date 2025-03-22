// Import required libraries
import {
  AIMessage,
  BaseMessage,
  isAIMessage
} from '@langchain/core/messages';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import 'highlight.js/styles/vs2015.css';
import MarkdownIt from 'markdown-it';

// Import components
import {
  AIMessageComponent,
  LogMessageComponent,
  FileChip
} from './components';
import { LoadingIndicator } from './components/LoadingIndicator';

// Import utils
import { getComponentForMessage, reconstructMessage } from './utils';

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
  const sendButtonContainer = document.getElementById('sendButtonContainer');
  const selectFilesButton = document.getElementById('selectFilesButton');
  const selectedFilesContainer = document.getElementById('selectedFiles');
  const smallModelNameElement = document.getElementById('smallModelName');
  const bigModelNameElement = document.getElementById('bigModelName');
  
  // Initialize loading indicator
  const loadingIndicator = new LoadingIndicator();
  if (sendButtonContainer) {
    sendButtonContainer.appendChild(loadingIndicator.getElement());
  }
  
  // State
  let selectedFiles: string[] = [];
  let isLoading = false;
  
  // Map to track streaming message elements by ID
  const streamingMessages = new Map<string, HTMLElement>();
  
  // Auto-resize textarea function
  function autoResizeTextarea() {
    if (!promptInput) return;
    
    // Reset height to auto to get correct scrollHeight
    promptInput.style.height = 'auto';
    // Set new height based on scrollHeight (+ padding to avoid scrollbar flicker)
    promptInput.style.height = `${promptInput.scrollHeight}px`;
  }
  
  // Set up auto-resize for textarea
  promptInput?.addEventListener('input', autoResizeTextarea);
  
  // Also resize on window resize
  window.addEventListener('resize', autoResizeTextarea);
  
  // Initial resize when page loads
  if (promptInput) {
    // Slightly delay the initial resize to ensure proper rendering
    setTimeout(autoResizeTextarea, 100);
  }
  
  // Request model information from extension
  vscode.postMessage({ command: 'getModelInfo' });
  
  // Event listeners
  loadingIndicator.onClick(sendPrompt);
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
      case 'modelInfo':
        updateModelInfo(message.smallModel, message.bigModel);
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
    
    // Clear input and reset height
    promptInput.value = '';
    promptInput.style.height = 'auto';
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
    
    // Create component, render it, and add to chat container in one step
    chatContainer?.appendChild(getComponentForMessage(message, selectedFiles).render());
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
        const fileChip = new FileChip(file, (fileToRemove) => {
          selectedFiles = selectedFiles.filter(f => f !== fileToRemove);
          updateSelectedFiles(selectedFiles);
        });
        selectedFilesContainer.appendChild(fileChip.render());
      });
    }
  }
  
  function updateModelInfo(smallModel: string, bigModel: string) {
    if (smallModelNameElement) {
      smallModelNameElement.textContent = smallModel;
    }
    if (bigModelNameElement) {
      bigModelNameElement.textContent = bigModel;
    }
  }
  
  function showLoadingIndicator() {
    isLoading = true;
    loadingIndicator.setLoading(true);
  }
  
  function hideLoadingIndicator() {
    isLoading = false;
    loadingIndicator.setLoading(false);
  }
  
  function scrollToBottom() {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }
})(); 