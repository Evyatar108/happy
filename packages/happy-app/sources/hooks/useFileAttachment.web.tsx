import * as React from 'react';
import { useFileAttachmentState, type FileAttachmentCandidate } from './useFileAttachmentCore';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
    }

    return btoa(binary);
}

function fileToCandidate(file: File): FileAttachmentCandidate {
    return {
        name: file.name,
        size: file.size,
        mimeType: file.type || undefined,
        readBase64: async () => arrayBufferToBase64(await file.arrayBuffer()),
    };
}

function filesFromDataTransferItems(items: DataTransferItemList): File[] {
    const files: File[] = [];
    for (const item of Array.from(items)) {
        if (item.kind !== 'file') {
            continue;
        }

        const file = item.getAsFile();
        if (file) {
            files.push(file);
        }
    }
    return files;
}

export function useFileAttachment() {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [isDragActive, setIsDragActive] = React.useState(false);
    const state = useFileAttachmentState();

    const addFiles = React.useCallback(async (files: FileList | readonly File[] | readonly FileAttachmentCandidate[]) => {
        const candidates = Array.from(files as ArrayLike<File | FileAttachmentCandidate>).map((file) => {
            if ('readBase64' in file) {
                return file;
            }
            return fileToCandidate(file);
        });

        await state.addFiles(candidates);
    }, [state]);

    const openFilePicker = React.useCallback(() => {
        inputRef.current?.click();
    }, []);

    const inputProps = React.useMemo(() => ({
        ref: inputRef,
        type: 'file' as const,
        multiple: true,
        onChange: async (event: React.ChangeEvent<HTMLInputElement>) => {
            if (event.currentTarget.files) {
                await addFiles(event.currentTarget.files);
            }
            event.currentTarget.value = '';
        },
    }), [addFiles]);

    const rootProps = React.useMemo(() => ({
        onDragOver: (event: React.DragEvent<HTMLElement>) => {
            const hasFiles = Array.from(event.dataTransfer.items).some(item => item.kind === 'file');
            if (!hasFiles) {
                return;
            }

            event.preventDefault();
            setIsDragActive(true);
        },
        onDragLeave: () => {
            setIsDragActive(false);
        },
        onDrop: async (event: React.DragEvent<HTMLElement>) => {
            const files = filesFromDataTransferItems(event.dataTransfer.items);
            if (files.length === 0) {
                return;
            }

            event.preventDefault();
            setIsDragActive(false);
            await addFiles(files);
        },
        onPaste: async (event: React.ClipboardEvent<HTMLElement>) => {
            const files = filesFromDataTransferItems(event.clipboardData.items);
            if (files.length === 0) {
                return;
            }

            event.preventDefault();
            await addFiles(files);
        },
    }), [addFiles]);

    return {
        ...state,
        addFiles,
        inputProps,
        rootProps,
        openFilePicker,
        isDragActive,
    };
}

export type { FileAttachment } from './useFileAttachmentCore';
