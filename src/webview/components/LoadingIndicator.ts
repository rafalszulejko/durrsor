export class LoadingIndicator {
  private element: HTMLButtonElement;
  private isLoading: boolean = false;

  constructor() {
    this.element = document.createElement('button');
    this.element.className = 'send-button';
    this.updateIcon();
  }

  public setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.updateIcon();
  }

  public onClick(handler: () => void): void {
    this.element.addEventListener('click', handler);
  }

  public getElement(): HTMLButtonElement {
    return this.element;
  }

  private updateIcon(): void {
    if (this.isLoading) {
      this.element.innerHTML = '<span class="codicon codicon-loading codicon-modifier-spin"></span>';
      this.element.setAttribute('disabled', 'true');
      this.element.title = 'Processing...';
    } else {
      this.element.innerHTML = '<span class="codicon codicon-send"></span>';
      this.element.removeAttribute('disabled');
      this.element.title = 'Send message';
    }
  }
} 