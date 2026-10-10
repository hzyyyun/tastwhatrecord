// 本地凭据保险箱：使用口令派生 AES-GCM 密钥，只在内存中解密 API Key。
import { getSetting, setSetting } from "./idb.mjs";

const STORAGE_KEY = "aiCredentialVault";
const VERSION = 1;
const ITERATIONS = 210_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  // 浏览器 Web Crypto 使用二进制，IndexedDB 记录使用可序列化 Base64。
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(passphrase, salt, iterations) {
  // PBKDF2 只负责派生密钥，密文由 AES-GCM 提供完整性校验。
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function validateCredentials(credentials) {
  // 去掉首尾空白和尾部斜杠，避免拼接请求地址时出现双斜杠。
  const baseURL = String(credentials.baseURL ?? "").trim().replace(/\/+$/, "");
  const model = String(credentials.model ?? "").trim();
  const apiKey = String(credentials.apiKey ?? "").trim();
  const tavilyApiKey = String(credentials.tavilyApiKey ?? "").trim();

  if (!/^https?:\/\//i.test(baseURL)) throw new Error("baseURL 必须以 http:// 或 https:// 开头。");
  if (!model) throw new Error("请填写模型名称。");
  if (!apiKey) throw new Error("请填写 AI API Key。");
  return { baseURL, model, apiKey, tavilyApiKey };
}

export async function encryptCredentials(credentials, passphrase) {
  // 每次保存都生成新盐和新 IV，禁止复用同一密钥流。
  if (String(passphrase).length < 6) throw new Error("本地口令至少 6 个字符。");
  const safe = validateCredentials(credentials);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(safe))
  );
  return {
    version: VERSION,
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    baseURL: safe.baseURL,
    model: safe.model,
    hasTavilyKey: Boolean(safe.tavilyApiKey),
    updatedAt: new Date().toISOString()
  };
}

export async function decryptCredentials(record, passphrase) {
  // 版本号先于解密检查，避免旧格式被误当作当前格式处理。
  if (!record || record.version !== VERSION) throw new Error("本地保险箱版本不受支持。");
  const salt = base64ToBytes(record.salt);
  const iv = base64ToBytes(record.iv);
  const key = await deriveKey(passphrase, salt, record.iterations ?? ITERATIONS);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      base64ToBytes(record.ciphertext)
    );
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error("口令错误或保险箱数据损坏。");
  }
}

export async function saveCredentialVault(db, passphrase, credentials) {
  // 写入的是密文记录；返回值仅用于当前页面会话内直接解锁。
  const record = await encryptCredentials(credentials, passphrase);
  await setSetting(db, STORAGE_KEY, record);
  return {
    ...validateCredentials(credentials)
  };
}

export async function unlockCredentialVault(db, passphrase) {
  const record = await getSetting(db, STORAGE_KEY);
  if (!record) throw new Error("尚未保存本地 AI 配置。");
  return decryptCredentials(record, passphrase);
}

export async function getCredentialVaultMetadata(db) {
  // 元数据可以包含 baseURL 和模型名，但绝不返回密文或密钥。
  const record = await getSetting(db, STORAGE_KEY);
  if (!record) return null;
  return {
    configured: true,
    version: record.version,
    baseURL: record.baseURL,
    model: record.model,
    tavilyConfigured: Boolean(record.hasTavilyKey),
    updatedAt: record.updatedAt
  };
}
