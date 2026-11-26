import { Capacitor, registerPlugin } from "@capacitor/core";

interface SecureStoragePlugin {
  set(options: { key: string; value: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value: string }>;
  remove(options: { key: string }): Promise<void>;
  clear(): Promise<void>;
}

const SecureStorage = registerPlugin<SecureStoragePlugin>("SecureStorage");
const memory = new Map<string, string>();
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validateKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new Error("Invalid secure storage key");
}

export function isSecureStorageMemoryOnly(): boolean {
  return Capacitor.getPlatform() !== "android";
}

export async function setSecureStorage(key: string, value: string): Promise<void> {
  validateKey(key);
  if (isSecureStorageMemoryOnly()) {
    memory.set(key, value);
    return;
  }
  await SecureStorage.set({ key, value });
}

export async function getSecureStorage(key: string): Promise<string> {
  validateKey(key);
  if (isSecureStorageMemoryOnly()) return memory.get(key) ?? "";
  const result = await SecureStorage.get({ key });
  return result.value ?? "";
}

export async function removeSecureStorage(key: string): Promise<void> {
  validateKey(key);
  if (isSecureStorageMemoryOnly()) {
    memory.delete(key);
    return;
  }
  await SecureStorage.remove({ key });
}

export async function clearSecureStorage(): Promise<void> {
  if (isSecureStorageMemoryOnly()) {
    memory.clear();
    return;
  }
  await SecureStorage.clear();
}
