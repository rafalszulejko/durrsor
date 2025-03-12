import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

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

export class LogMessageComponent {
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