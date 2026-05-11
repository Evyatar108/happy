import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { create } from 'zustand';

export type NewSessionImageAttachment = {
    id: string;
    type: 'image';
    ref: string;
    mimeType: 'image/jpeg' | 'image/png';
    name?: string;
    encodedBytes: number;
};

type NewSessionAttachmentInput = {
    uri: string;
    mimeType?: string | null;
    base64?: string | null;
    width?: number | null;
    height?: number | null;
    fileName?: string | null;
};

interface NewSessionAttachmentsState {
    attachments: NewSessionImageAttachment[];
    setAttachment: (attachment: NewSessionImageAttachment) => void;
    clearAttachment: (id: string) => void;
    clearAttachments: () => void;
}

const SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
const MAX_RAW_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ENCODED_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const JPEG_QUALITIES = [0.85, 0.7, 0.55, 0.4, 0.25] as const;

export const useNewSessionAttachments = create<NewSessionAttachmentsState>()((set) => ({
    attachments: [],
    setAttachment: (attachment) => set({ attachments: [attachment] }),
    clearAttachment: (id) => set((state) => ({ attachments: state.attachments.filter((attachment) => attachment.id !== id) })),
    clearAttachments: () => set({ attachments: [] }),
}));

export function getBase64Payload(ref: string): string {
    const separator = ref.indexOf(',');
    return separator === -1 ? ref : ref.slice(separator + 1);
}

export function getRawByteEstimateFromBase64(base64: string): number {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
}

export function normalizeNewSessionImageMimeType(mimeType: string | null | undefined): NewSessionImageAttachment['mimeType'] | null {
    if (mimeType === 'image/jpg') {
        return 'image/jpeg';
    }
    return SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType as NewSessionImageAttachment['mimeType'])
        ? mimeType as NewSessionImageAttachment['mimeType']
        : null;
}

export async function prepareNewSessionImageAttachment(asset: NewSessionAttachmentInput): Promise<NewSessionImageAttachment> {
    const selectedMimeType = normalizeNewSessionImageMimeType(asset.mimeType);
    if (!selectedMimeType) {
        throw new Error('unsupported-type');
    }

    if (asset.uri.startsWith('data:')) {
        const dataUrlMatch = /^data:([^;,]+);base64,/i.exec(asset.uri);
        if (!dataUrlMatch || dataUrlMatch[1].trim().toLowerCase() !== selectedMimeType) {
            throw new Error('unsupported-type');
        }
    }

    const originalBase64 = asset.base64 ?? (asset.uri.startsWith('data:') ? getBase64Payload(asset.uri) : null);
    if (originalBase64 && originalBase64.length <= MAX_ENCODED_ATTACHMENT_BYTES) {
        return buildAttachment(originalBase64, selectedMimeType, asset.fileName);
    }

    const compressed = await compressImageToBase64(asset.uri, asset.width, asset.height);
    if (compressed.length > MAX_ENCODED_ATTACHMENT_BYTES || getRawByteEstimateFromBase64(compressed) > MAX_RAW_ATTACHMENT_BYTES) {
        throw new Error('too-large');
    }

    return buildAttachment(compressed, 'image/jpeg', asset.fileName);
}

export async function pickNewSessionImageAttachment(): Promise<NewSessionImageAttachment | null> {
    if (Platform.OS === 'web') {
        return pickWebImageAttachment();
    }

    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        base64: true,
        quality: 1,
    });

    if (result.canceled || result.assets.length === 0) {
        return null;
    }

    return prepareNewSessionImageAttachment(result.assets[0]);
}

async function compressImageToBase64(uri: string, width?: number | null, height?: number | null): Promise<string> {
    let resizeWidth = width && width > 0 ? width : undefined;
    let resizeHeight = height && height > 0 ? height : undefined;

    for (let attempt = 0; attempt < 4; attempt += 1) {
        for (const quality of JPEG_QUALITIES) {
            const actions = resizeWidth && resizeHeight
                ? [{ resize: { width: resizeWidth, height: resizeHeight } }]
                : [];
            const manipulated = await ImageManipulator.manipulateAsync(uri, actions, {
                base64: true,
                compress: quality,
                format: ImageManipulator.SaveFormat.JPEG,
            });
            if (manipulated.base64 && getRawByteEstimateFromBase64(manipulated.base64) <= MAX_RAW_ATTACHMENT_BYTES) {
                return manipulated.base64;
            }
        }

        if (!resizeWidth || !resizeHeight) {
            break;
        }
        resizeWidth = Math.max(1, Math.floor(resizeWidth * 0.75));
        resizeHeight = Math.max(1, Math.floor(resizeHeight * 0.75));
    }

    throw new Error('too-large');
}

function buildAttachment(
    base64: string,
    mimeType: NewSessionImageAttachment['mimeType'],
    name?: string | null,
): NewSessionImageAttachment {
    return {
        id: `image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'image',
        ref: `data:${mimeType};base64,${base64}`,
        mimeType,
        name: name ?? undefined,
        encodedBytes: base64.length,
    };
}

function pickWebImageAttachment(): Promise<NewSessionImageAttachment | null> {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';

        input.onchange = () => {
            const file = input.files?.[0];
            input.remove();
            if (!file) {
                resolve(null);
                return;
            }

            const reader = new FileReader();
            reader.onerror = () => reject(new Error('read-failed'));
            reader.onload = async () => {
                try {
                    const uri = typeof reader.result === 'string' ? reader.result : '';
                    resolve(await prepareNewSessionImageAttachment({
                        uri,
                        mimeType: file.type,
                        base64: getBase64Payload(uri),
                        fileName: file.name,
                    }));
                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsDataURL(file);
        };

        document.body.appendChild(input);
        input.click();
    });
}
