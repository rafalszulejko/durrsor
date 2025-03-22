export class FileChip {
    private element: HTMLSpanElement;
    private onRemove: (file: string) => void;
    private fullPath: string;

    constructor(fullPath: string, onRemove: (file: string) => void) {
        this.fullPath = fullPath;
        this.onRemove = onRemove;
        this.element = this.createChipElement();
    }

    private getFileName(): string {
        return this.fullPath.split('/').pop() || this.fullPath;
    }

    private createChipElement(): HTMLSpanElement {
        const chip = document.createElement('span');
        chip.className = 'file-chip';
        chip.title = this.fullPath;

        // Add file icon
        const fileIcon = document.createElement('i');
        fileIcon.className = 'codicon codicon-file-code';
        chip.appendChild(fileIcon);

        // Add file name
        const fileName = document.createElement('span');
        fileName.className = 'file-name';
        fileName.textContent = this.getFileName();
        chip.appendChild(fileName);

        // Add remove button
        const removeButton = document.createElement('button');
        removeButton.className = 'remove-file';
        removeButton.textContent = '×';
        removeButton.addEventListener('click', () => this.onRemove(this.fullPath));
        chip.appendChild(removeButton);

        return chip;
    }

    public render(): HTMLElement {
        return this.element;
    }
} 