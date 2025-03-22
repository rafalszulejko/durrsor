export class FileChip {
    private element: HTMLSpanElement;
    private onRemove: (file: string) => void;
    private fullPath: string;
    private removable: boolean;

    constructor(fullPath: string, onRemove: (file: string) => void, removable: boolean = true) {
        this.fullPath = fullPath;
        this.onRemove = onRemove;
        this.removable = removable;
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

        // Add remove button only if removable
        if (this.removable) {
            const removeButton = document.createElement('button');
            removeButton.className = 'remove-file';
            removeButton.textContent = '×';
            removeButton.addEventListener('click', () => this.onRemove(this.fullPath));
            chip.appendChild(removeButton);
        }

        return chip;
    }

    public render(): HTMLElement {
        return this.element;
    }
} 