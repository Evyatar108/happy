import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'minio';

export interface FilesConfig {
    dataDir?: string;
    publicUrl?: string;
    s3?: {
        host: string;
        port?: number;
        useSSL?: boolean;
        region?: string;
        accessKey: string;
        secretKey: string;
        bucket: string;
        publicUrl: string;
    };
}

let filesConfig: FilesConfig | null = null;
let useLocalStorage = true;
let localFilesDir = path.join('./data', 'files');
let publicUrl: string | undefined;
export let s3client: any = null;
export let s3bucket: string = '';
export let s3host: string = '';
let s3public: string = '';

export function configureFiles(config: FilesConfig) {
    filesConfig = config;
    useLocalStorage = !config.s3;
    localFilesDir = path.join(config.dataDir || './data', 'files');
    publicUrl = config.publicUrl;

    if (!config.s3) {
        s3client = null;
        s3bucket = '';
        s3host = '';
        s3public = '';
        return;
    }

    s3client = new Client({
        endPoint: config.s3.host,
        port: config.s3.port,
        useSSL: config.s3.useSSL ?? true,
        accessKey: config.s3.accessKey,
        secretKey: config.s3.secretKey,
        region: config.s3.region || 'us-east-1',
    });
    s3bucket = config.s3.bucket;
    s3host = config.s3.host;
    s3public = config.s3.publicUrl;
}

function configureFilesFromEnv() {
    if (filesConfig) {
        return;
    }
    configureFiles({
        dataDir: process.env.DATA_DIR || './data',
        publicUrl: process.env.PUBLIC_URL,
        s3: process.env.S3_HOST ? {
            host: process.env.S3_HOST,
            port: process.env.S3_PORT ? parseInt(process.env.S3_PORT, 10) : undefined,
            useSSL: process.env.S3_USE_SSL ? process.env.S3_USE_SSL === 'true' : true,
            region: process.env.S3_REGION || 'us-east-1',
            accessKey: process.env.S3_ACCESS_KEY!,
            secretKey: process.env.S3_SECRET_KEY!,
            bucket: process.env.S3_BUCKET!,
            publicUrl: process.env.S3_PUBLIC_URL!,
        } : undefined,
    });
}

export async function loadFiles() {
    configureFilesFromEnv();
    if (useLocalStorage) {
        fs.mkdirSync(localFilesDir, { recursive: true });
        return;
    }
    await s3client.bucketExists(s3bucket);
}

export function getPublicUrl(filePath: string) {
    configureFilesFromEnv();
    if (useLocalStorage) {
        const baseUrl = publicUrl || `http://localhost:${process.env.PORT || '3005'}`;
        return `${baseUrl}/files/${filePath}`;
    }
    return `${s3public}/${filePath}`;
}

export function isLocalStorage() {
    configureFilesFromEnv();
    return useLocalStorage;
}

export function getLocalFilesDir() {
    configureFilesFromEnv();
    return localFilesDir;
}

export async function putLocalFile(filePath: string, data: Buffer) {
    configureFilesFromEnv();
    const fullPath = path.join(localFilesDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, data);
}

export type ImageRef = {
    width: number;
    height: number;
    thumbhash: string;
    path: string;
}
