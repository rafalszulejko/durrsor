import { BaseMessage } from '@langchain/core/messages';
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

export class MessageComponent {
  protected message: BaseMessage;
  
  constructor(message: BaseMessage) {
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