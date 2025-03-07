// Import required libraries
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

// Declare the VS Code API
declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
};

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
  
  // State
  let selectedFiles: string[] = [];
  let currentAIMessage: HTMLElement | null = null;
  let currentLogContainer: HTMLElement | null = null;
  
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
      case 'agentResponse':
        // If we already have a message with content, just update the files
        if (currentAIMessage) {
          updateFilesModified(currentAIMessage, message.files);
        } else {
          addAIMessage(message.response, message.files);
        }
        // Reset current message tracking
        currentAIMessage = null;
        currentLogContainer = null;
        break;
      case 'selectedFiles':
        updateSelectedFiles(message.files);
        break;
      case 'showLoading':
        showLoadingIndicator();
        break;
      case 'logMessage':
        handleLogMessage(message.level, message.message);
        break;
    }
  });
  
  // Functions
  function sendPrompt() {
    if (!promptInput) {
      return;
    }
    
    const prompt = promptInput.value.trim();
    if (!prompt) {
      return;
    }
    
    // Add human message to chat
    addHumanMessage(prompt, selectedFiles);
    
    // Send to extension
    vscode.postMessage({
      command: 'sendPrompt',
      prompt,
      selectedFiles
    });
    
    // Clear input
    promptInput.value = '';
  }
  
  function addHumanMessage(prompt: string, files: string[]) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message human-message';
    
    const promptElement = document.createElement('div');
    promptElement.className = 'prompt';
    promptElement.textContent = prompt;
    
    messageElement.appendChild(promptElement);
    
    if (files.length > 0) {
      const filesElement = document.createElement('div');
      filesElement.className = 'files';
      
      files.forEach(file => {
        const fileChip = document.createElement('span');
        fileChip.className = 'file-chip';
        fileChip.textContent = file;
        filesElement.appendChild(fileChip);
      });
      
      messageElement.appendChild(filesElement);
    }
    
    chatContainer?.appendChild(messageElement);
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }
  
  function addAIMessage(response: string, files: string[]) {
    // Remove loading indicator if present
    const loadingIndicator = document.querySelector('.loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message ai-message';
    
    // Render markdown using markdown-it
    const responseElement = document.createElement('div');
    responseElement.className = 'response';
    responseElement.innerHTML = md.render(response);
    
    messageElement.appendChild(responseElement);
    
    if (files && files.length > 0) {
      updateFilesModified(messageElement, files);
    }
    
    chatContainer?.appendChild(messageElement);
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    return messageElement;
  }
  
  function updateFilesModified(messageElement: HTMLElement, files: string[]) {
    // Remove existing files element if present
    const existingFilesElement = messageElement.querySelector('.files-modified');
    if (existingFilesElement) {
      existingFilesElement.remove();
    }
    
    if (files && files.length > 0) {
      const filesElement = document.createElement('div');
      filesElement.className = 'files-modified';
      filesElement.innerHTML = `<strong>Files modified:</strong>`;
      
      const filesList = document.createElement('ul');
      files.forEach(file => {
        const fileItem = document.createElement('li');
        fileItem.textContent = file;
        filesList.appendChild(fileItem);
      });
      
      filesElement.appendChild(filesList);
      messageElement.appendChild(filesElement);
    }
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
    // Remove any existing loading indicator
    const existingLoadingIndicator = document.querySelector('.loading-indicator');
    if (existingLoadingIndicator) {
      existingLoadingIndicator.remove();
    }
    
    // Create a new AI message container for this response
    currentAIMessage = document.createElement('div');
    currentAIMessage.className = 'message ai-message';
    
    // Create a single log container for all log messages
    currentLogContainer = document.createElement('div');
    currentLogContainer.className = 'log-container';
    
    // Add loading indicator
    const loadingElement = document.createElement('div');
    loadingElement.className = 'loading-indicator';
    loadingElement.innerHTML = '<div class="loading-spinner"></div><div>Thinking...</div>';
    
    // Add elements to the message
    currentAIMessage.appendChild(currentLogContainer);
    currentAIMessage.appendChild(loadingElement);
    
    chatContainer?.appendChild(currentAIMessage);
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }
  
  function handleLogMessage(level: string, message: string) {
    // If we don't have a current AI message, create one
    if (!currentAIMessage) {
      showLoadingIndicator();
    }
    
    // Remove loading indicator if present
    const loadingIndicator = currentAIMessage?.querySelector('.loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    
    if (currentLogContainer) {
      // Skip internal messages
      if (level === 'internal') {
        return;
      }
      
      // Create a log message with appropriate class based on level
      const logMessage = document.createElement('div');
      logMessage.className = `log-message ${level}-message`;
      
      // For code blocks, use markdown rendering
      if (message.includes('```')) {
        logMessage.innerHTML = md.render(message);
      } else {
        // For regular messages, just set text content with a line break
        const formattedMessage = document.createElement('p');
        formattedMessage.textContent = message;
        logMessage.appendChild(formattedMessage);
      }
      
      // Add to the log container
      currentLogContainer.appendChild(logMessage);
      
      // Scroll to bottom
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }
  }
})(); 