import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import * as React from 'react';
import { useFileAttachmentState, type FileAttachmentCandidate } from './useFileAttachmentCore';

function assetToCandidate(asset: DocumentPicker.DocumentPickerAsset): FileAttachmentCandidate {
    return {
        name: asset.name,
        size: asset.size ?? 0,
        mimeType: asset.mimeType,
        readBase64: () => new ExpoFile(asset.uri).base64(),
    };
}

export function useFileAttachment() {
    const state = useFileAttachmentState();

    const addFiles = React.useCallback(async (files: readonly DocumentPicker.DocumentPickerAsset[] | readonly FileAttachmentCandidate[]) => {
        const candidates = files.map((file) => {
            if ('readBase64' in file) {
                return file;
            }
            return assetToCandidate(file);
        });

        await state.addFiles(candidates);
    }, [state]);

    const pickFiles = React.useCallback(async () => {
        const result = await DocumentPicker.getDocumentAsync({
            multiple: true,
            copyToCacheDirectory: true,
        });

        if (result.canceled) {
            return;
        }

        await addFiles(result.assets);
    }, [addFiles]);

    return {
        ...state,
        addFiles,
        pickFiles,
    };
}

export type { FileAttachment } from './useFileAttachmentCore';
