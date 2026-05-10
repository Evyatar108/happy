function base64ToBase64Url(value: string): string {
    return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBase64(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}

export function encodeBase64Url(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return base64ToBase64Url(btoa(binary));
}

export function decodeBase64Url(value: string): string {
    const binary = atob(base64UrlToBase64(value));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    try {
        return new TextDecoder().decode(bytes);
    } catch {
        return binary;
    }
}
