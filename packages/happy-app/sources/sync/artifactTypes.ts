/**
 * Artifact from API
 */
export interface Artifact {
    id: string;
    header: string;
    headerVersion: number;
    body?: string;
    bodyVersion?: number;  // Only in full fetch
    seq: number;
    createdAt: number;
    updatedAt: number;
}

/**
 * Artifact header
 */
export interface ArtifactHeader {
    title: string | null;
    sessions?: string[];  // Optional array of session IDs linked to this artifact
    draft?: boolean;      // Optional draft flag - hides artifact from visible list when true
}

/**
 * Artifact body
 */
export interface ArtifactBody {
    body: string | null;
}

/**
 * Artifact for UI
 */
export interface DecryptedArtifact {
    id: string;
    title: string | null;
    sessions?: string[];  // Optional array of session IDs linked to this artifact
    draft?: boolean;      // Optional draft flag - hides artifact from visible list when true
    body?: string | null;  // Only loaded when viewing full artifact
    headerVersion: number;
    bodyVersion?: number;
    seq: number;
    createdAt: number;
    updatedAt: number;
    isDecrypted: boolean;
}

/**
 * Request to create a new artifact
 */
export interface ArtifactCreateRequest {
    id: string;  // UUID generated client-side
    header: string;
    body: string;
}

/**
 * Request to update an existing artifact
 */
export interface ArtifactUpdateRequest {
    header?: string;
    expectedHeaderVersion?: number;
    body?: string;
    expectedBodyVersion?: number;
}

/**
 * Response from update operation
 */
export type ArtifactUpdateResponse = 
    | {
        success: true;
        headerVersion?: number;
        bodyVersion?: number;
    }
    | {
        success: false;
        error: 'version-mismatch';
        currentHeaderVersion?: number;
        currentBodyVersion?: number;
        currentHeader?: string;
        currentBody?: string;
    };
