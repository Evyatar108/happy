import { AuthCredentials } from '@/auth/tokenStorage';
import { getMachineAuthHeaders } from '@/auth/machineAuth';
import { backoff } from '@/utils/time';
import { getHappyClientId } from './apiSocket';
import { Artifact, ArtifactCreateRequest, ArtifactUpdateRequest, ArtifactUpdateResponse } from './artifactTypes';

/**
 * Fetch all artifacts for the account
 */
export async function fetchArtifacts(credentials: AuthCredentials): Promise<Artifact[]> {
    const API_ENDPOINT = credentials.tunnelUrl;

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/artifacts`, {
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
                ...getMachineAuthHeaders(credentials),
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch artifacts: ${response.status}`);
        }

        const data = await response.json() as Artifact[];
        return data;
    });
}

/**
 * Fetch a single artifact with full body
 */
export async function fetchArtifact(credentials: AuthCredentials, artifactId: string): Promise<Artifact> {
    const API_ENDPOINT = credentials.tunnelUrl;

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/artifacts/${artifactId}`, {
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
                ...getMachineAuthHeaders(credentials),
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Artifact not found');
            }
            throw new Error(`Failed to fetch artifact: ${response.status}`);
        }

        const data = await response.json() as Artifact;
        return data;
    });
}

/**
 * Create a new artifact
 */
export async function createArtifact(
    credentials: AuthCredentials, 
    request: ArtifactCreateRequest
): Promise<Artifact> {
    const API_ENDPOINT = credentials.tunnelUrl;

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/artifacts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
                ...getMachineAuthHeaders(credentials),
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            if (response.status === 409) {
                throw new Error('Artifact ID already exists');
            }
            throw new Error(`Failed to create artifact: ${response.status}`);
        }

        const data = await response.json() as Artifact;
        return data;
    });
}

/**
 * Update an existing artifact
 */
export async function updateArtifact(
    credentials: AuthCredentials,
    artifactId: string,
    request: ArtifactUpdateRequest
): Promise<ArtifactUpdateResponse> {
    const API_ENDPOINT = credentials.tunnelUrl;

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/artifacts/${artifactId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
                ...getMachineAuthHeaders(credentials),
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Artifact not found');
            }
            throw new Error(`Failed to update artifact: ${response.status}`);
        }

        const data = await response.json() as ArtifactUpdateResponse;
        return data;
    });
}

/**
 * Delete an artifact
 */
export async function deleteArtifact(
    credentials: AuthCredentials,
    artifactId: string
): Promise<void> {
    const API_ENDPOINT = credentials.tunnelUrl;

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/artifacts/${artifactId}`, {
            method: 'DELETE',
            headers: {
                'X-Happy-Client': getHappyClientId(),
                ...getMachineAuthHeaders(credentials),
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Artifact not found');
            }
            throw new Error(`Failed to delete artifact: ${response.status}`);
        }
    });
}