import * as React from 'react';
import { Modal } from '@/modal';
import { t } from '@/text';
import { dedupeAttachmentNames, sanitizeAttachmentName } from '@/utils/attachmentName';

export const MAX_ATTACHMENT_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_SIZE = 100 * 1024 * 1024;

export type FileAttachment = {
    id: string;
    name: string;
    originalName: string;
    size: number;
    base64: string;
    mimeType?: string;
};

export type FileAttachmentCandidate = {
    name: string;
    size: number;
    mimeType?: string;
    readBase64: () => Promise<string>;
};

export type AddFiles = (files: readonly FileAttachmentCandidate[]) => Promise<void>;

function createAttachmentId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function showAttachmentError(message: string) {
    Modal.alert(t('common.error'), message, [{ text: t('common.ok') }]);
}

export function useFileAttachmentState() {
    const [attachments, setAttachments] = React.useState<FileAttachment[]>([]);
    const attachmentsRef = React.useRef<FileAttachment[]>([]);

    React.useEffect(() => {
        attachmentsRef.current = attachments;
    }, [attachments]);

    const addFiles = React.useCallback<AddFiles>(async (files) => {
        if (files.length === 0) {
            return;
        }

        if (files.some(file => file.size > MAX_ATTACHMENT_FILE_SIZE)) {
            showAttachmentError(t('errors.attachmentPerFileTooLarge'));
            return;
        }

        const currentAttachments = attachmentsRef.current;
        const currentSize = currentAttachments.reduce((total, file) => total + file.size, 0);
        const incomingSize = files.reduce((total, file) => total + file.size, 0);
        if (currentSize + incomingSize > MAX_ATTACHMENT_TOTAL_SIZE) {
            showAttachmentError(t('errors.attachmentTotalTooLarge'));
            return;
        }

        try {
            const existingNames = currentAttachments.map(file => file.name);
            const incomingNames = files.map(file => sanitizeAttachmentName(file.name));
            const dedupedNames = dedupeAttachmentNames([...existingNames, ...incomingNames]).slice(existingNames.length);
            const nextAttachments = await Promise.all(files.map(async (file, index): Promise<FileAttachment> => ({
                id: createAttachmentId(),
                name: dedupedNames[index],
                originalName: file.name,
                size: file.size,
                mimeType: file.mimeType,
                base64: await file.readBase64(),
            })));

            setAttachments(current => {
                const updated = [...current, ...nextAttachments];
                attachmentsRef.current = updated;
                return updated;
            });
        } catch {
            showAttachmentError(t('errors.attachmentUploadFailed'));
        }
    }, []);

    const removeAttachment = React.useCallback((id: string) => {
        setAttachments(current => {
            const updated = current.filter(file => file.id !== id);
            attachmentsRef.current = updated;
            return updated;
        });
    }, []);

    const clear = React.useCallback(() => {
        attachmentsRef.current = [];
        setAttachments([]);
    }, []);

    return {
        attachments,
        addFiles,
        removeAttachment,
        clear,
    };
}
