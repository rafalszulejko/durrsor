// Import required libraries
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import 'highlight.js/styles/vs2015.css';

// Declare the VS Code API
declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
};

// Message types from LangChain
type MessageType = 'human' | 'ai' | 'tool';

// Message interface
interface Message {
  type: MessageType;
  content: string;
  id?: string;
  additional_kwargs?: {
    tool_call_id?: string;
    name?: string;
    [key: string]: any;
  };
}

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
        handleMessage(message.message);
        break;
      case 'messageChunk':
        handleMessageChunk(message.chunk);
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
  
  function handleMessage(message: Message) {
    // For AI messages that are being streamed, we may already have a placeholder element
    if (message.type === 'ai' && message.id && streamingMessages.has(message.id)) {
      // The message is complete, but we've already been rendering it via chunks
      // Just ensure it's fully up to date
      const existingElement = streamingMessages.get(message.id)!;
      const contentElement = existingElement.querySelector('.message-content');
      if (contentElement) {
        contentElement.innerHTML = md.render(message.content);
      }
      
      // Remove from streaming messages map
      streamingMessages.delete(message.id);
      return;
    }
    
    // Create the appropriate component based on message type
    let messageComponent;
    
    switch (message.type) {
      case 'human':
        messageComponent = new HumanMessageComponent(message, selectedFiles);
        break;
      case 'ai':
        messageComponent = new AIMessageComponent(message);
        break;
      case 'tool':
        // Determine which tool component to use based on the tool name
        const toolName = message.additional_kwargs?.name || 'generic';
        
        switch (toolName) {
          case 'read_file':
            messageComponent = new ReadFileToolComponent(message);
            break;
          case 'edit_file':
            messageComponent = new EditFileToolComponent(message);
            break;
          default:
            messageComponent = new GenericToolComponent(message);
            break;
        }
        break;
      default:
        // Fallback for unknown message types
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
      const message: Message = {
        type: 'ai',
        content: '',
        id: chunk.id
      };
      
      const messageComponent = new AIMessageComponent(message);
      const element = messageComponent.render();
      
      // Add to the chat container
      chatContainer?.appendChild(element);
      
      // Store in the streaming messages map
      streamingMessages.set(chunk.id, element);
    }
    
    // Get the existing message element
    const element = streamingMessages.get(chunk.id)!;
    
    // Find the content element
    const contentElement = element.querySelector('.message-content');
    if (contentElement) {
      // Append the new content
      const currentContent = contentElement.getAttribute('data-raw-content') || '';
      const newContent = currentContent + chunk.content;
      
      // Store the raw content for future updates
      contentElement.setAttribute('data-raw-content', newContent);
      
      // Render the markdown
      contentElement.innerHTML = md.render(newContent);
    }
    
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
  
  // Message Components
  
  // Base Message Component
  class MessageComponent {
    protected message: Message;
    
    constructor(message: Message) {
      this.message = message;
    }
    
    render(): HTMLElement {
      const element = document.createElement('div');
      element.className = 'message';
      
      // Add message ID as data attribute if available
      if (this.message.id) {
        element.setAttribute('data-message-id', this.message.id);
      }
      
      return element;
    }
    
    protected renderMarkdown(content: string): string {
      return md.render(content);
    }
  }
  
  // Human Message Component
  class HumanMessageComponent extends MessageComponent {
    private selectedFiles: string[];
    
    constructor(message: Message, selectedFiles: string[]) {
      super(message);
      this.selectedFiles = selectedFiles;
    }
    
    render(): HTMLElement {
      const element = document.createElement('div');
      element.className = 'message human-message';
      
      const contentElement = document.createElement('div');
      contentElement.className = 'message-content';
      contentElement.textContent = this.message.content;
      
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
  
  // AI Message Component
  class AIMessageComponent extends MessageComponent {
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
      contentElement.setAttribute('data-raw-content', this.message.content);
      
      // Render the content
      contentElement.innerHTML = this.renderMarkdown(this.message.content);
      
      element.appendChild(contentElement);
      
      return element;
    }
  }
  
  // Log Message Component
  class LogMessageComponent {
    private level: string;
    private message: string;
    private isNewType?: boolean;
    
    constructor(level: string, message: string, isNewType?: boolean) {
      this.level = level;
      this.message = message;
      this.isNewType = isNewType;
    }
    
    render(): HTMLElement {
      const element = document.createElement('div');
      element.className = `message log-message ${this.level}-log`;
      
      // Add a class for new log types to add extra spacing
      if (this.isNewType) {
        element.classList.add('new-log-type');
      }
      
      // For diff messages, use special rendering with diff highlighting
      if (this.level === 'diff') {
        // Create a container for the diff content
        const diffContainer = document.createElement('div');
        diffContainer.className = 'diff-container';
        
        // Extract code content if wrapped in markdown code blocks
        let diffContent = this.message;
        if (this.message.includes('```')) {
          const codeMatch = this.message.match(/```(?:diff)?\s*([\s\S]*?)```/);
          if (codeMatch && codeMatch[1]) {
            diffContent = codeMatch[1];
          }
        }
        
        // Create pre and code elements for syntax highlighting
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = 'language-diff hljs';
        code.innerHTML = hljs.highlight(diffContent, { language: 'diff' }).value;
        
        pre.appendChild(code);
        diffContainer.appendChild(pre);
        element.appendChild(diffContainer);
      }
      // For code blocks, use markdown rendering
      else if (this.message.includes('```')) {
        element.innerHTML = md.render(this.message);
      } else {
        // For regular messages, just set text content with a line break
        const formattedMessage = document.createElement('p');
        formattedMessage.textContent = this.message;
        element.appendChild(formattedMessage);
      }
      
      return element;
    }
  }
  
  // Read File Tool Component
  class ReadFileToolComponent extends MessageComponent {
    render(): HTMLElement {
      const element = document.createElement('div');
      element.className = 'message tool-message read-file-tool';
      
      const headerElement = document.createElement('div');
      headerElement.className = 'tool-header';
      headerElement.innerHTML = `<span class="tool-icon">📄</span> <span class="tool-name">Read File</span>`;
      
      const contentElement = document.createElement('div');
      contentElement.className = 'tool-content';
      
      // Extract file path if available
      const filePath = this.message.additional_kwargs?.file_path || 
                      this.message.additional_kwargs?.arguments?.file_path || 
                      'Unknown file';
      
      const filePathElement = document.createElement('div');
      filePathElement.className = 'file-path';
      filePathElement.textContent = filePath;
      
      // Render content
      const fileContentElement = document.createElement('div');
      fileContentElement.className = 'file-content';
      fileContentElement.innerHTML = this.renderMarkdown(this.message.content);
      
      contentElement.appendChild(filePathElement);
      contentElement.appendChild(fileContentElement);
      
      element.appendChild(headerElement);
      element.appendChild(contentElement);
      
      return element;
    }
  }
  
  // Edit File Tool Component
  class EditFileToolComponent extends MessageComponent {
    render(): HTMLElement {
      const element = document.createElement('div');
      element.className = 'message tool-message edit-file-tool';
      
      const headerElement = document.createElement('div');
      headerElement.className = 'tool-header';
      headerElement.innerHTML = `<span class="tool-icon">✏️</span> <span class="tool-name">Edit File</span>`;
      
      const contentElement = document.createElement('div');
      contentElement.className = 'tool-content';
      
      // Extract file path if available
      const filePath = this.message.additional_kwargs?.file_path || 
                      this.message.additional_kwargs?.arguments?.file_path || 
                      'Unknown file';
      
      const filePathElement = document.createElement('div');
      filePathElement.className = 'file-path';
      filePathElement.textContent = filePath;
      
      // Render content
      const editContentElement = document.createElement('div');
      editContentElement.className = 'edit-content';
      editContentElement.innerHTML = this.renderMarkdown(this.message.content);
      
      contentElement.appendChild(filePathElement);
      contentElement.appendChild(editContentElement);
      
      element.appendChild(headerElement);
      element.appendChild(contentElement);
      
      return element;
    }
  }
  
  // Generic Tool Component
  class GenericToolComponent extends MessageComponent {
    render(): HTMLElement {
      const element = document.createElement('div');
      element.className = 'message tool-message';
      
      const toolName = this.message.additional_kwargs?.name || 'Tool';
      
      const headerElement = document.createElement('div');
      headerElement.className = 'tool-header';
      headerElement.innerHTML = `<span class="tool-icon">🔧</span> <span class="tool-name">${toolName}</span>`;
      
      const contentElement = document.createElement('div');
      contentElement.className = 'tool-content';
      
      // Render content
      if (this.message.content.includes('```')) {
        contentElement.innerHTML = this.renderMarkdown(this.message.content);
      } else {
        contentElement.textContent = this.message.content;
      }
      
      element.appendChild(headerElement);
      element.appendChild(contentElement);
      
      return element;
    }
  }
  
  // Generic Message Component (fallback)
  class GenericMessageComponent extends MessageComponent {
    render(): HTMLElement {
      const element = document.createElement('div');
      element.className = 'message generic-message';
      
      const contentElement = document.createElement('div');
      contentElement.className = 'message-content';
      contentElement.textContent = this.message.content;
      
      element.appendChild(contentElement);
      
      return element;
    }
  }
})(); 