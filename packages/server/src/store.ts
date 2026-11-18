import { mkdir, readFile, writeFile } from "node:fs/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Immutable blobs: keys are written once and never updated. */
export interface BlobStore {
  put(key: string, body: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

export const memoryStore = (): BlobStore => {
  const m = new Map<string, string>();
  return { put: async (k, b) => void m.set(k, b), get: async (k) => m.get(k) ?? null };
};

// keys are server-generated (`flows/<base32 id>.json`), never user input
export const dirStore = (dir: string): BlobStore => ({
  async put(key, body) {
    const f = new URL(key, `file://${dir}/`);
    await mkdir(new URL(".", f), { recursive: true });
    await writeFile(f, body);
  },
  get: async (key) => readFile(new URL(key, `file://${dir}/`), "utf8").catch(() => null),
});

export function r2Store(env: Record<string, string | undefined>): BlobStore {
  const s3 = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  });
  const Bucket = env.R2_BUCKET!;
  return {
    async put(Key, Body) {
      await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType: "application/json", IfNoneMatch: "*" }));
    },
    async get(Key) {
      try { return await (await s3.send(new GetObjectCommand({ Bucket, Key }))).Body!.transformToString(); }
      catch (e: any) { if (e.name === "NoSuchKey") return null; throw e; }
    },
  };
}

export const storeFromEnv = (env: Record<string, string | undefined>): BlobStore =>
  env.R2_BUCKET ? r2Store(env) : dirStore(new URL("../data/blobs", import.meta.url).pathname);
