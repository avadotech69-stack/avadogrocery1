import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import sharp from 'sharp';
import { pool } from './db';

export interface ChatHistoryTurn {
  role: 'user' | 'model';
  text: string;
}

export interface CatalogProductSummary {
  id: string;
  slug: string;
  name: string;
  nameBn: string;
  brand: string;
  brandBn: string;
  category: string;
  categoryName: string;
  categoryNameBn: string;
  price: number;
  originalPrice?: number;
  unit: string;
  unitBn: string;
  inStock: boolean;
  stockCount: number;
  image: string;
  description: string;
  descriptionBn: string;
  variants?: Array<{ label: string; labelBn?: string; price: number; originalPrice?: number }>;
}

export interface StoreKnowledgeSnapshot {
  categories: Array<{
    slug: string;
    name: string;
    nameBn: string;
    description: string;
  }>;
  products: CatalogProductSummary[];
  coupons: Array<{
    code: string;
    type: string;
    value: number;
    minSubtotal: number;
    maxDiscount?: number;
    description: string;
    descriptionBn: string;
  }>;
  deliveryAreas: Array<{
    id: string;
    name: string;
    nameBn: string;
    fee: number;
    freeOver: number;
    eta: string;
    etaBn: string;
  }>;
}

export interface StoreChatResult {
  reply: string;
  detectedItemName?: string;
  products: CatalogProductSummary[];
}

const FAST_AI_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_AI_MODEL = 'gemini-4-hydrogen';
const CATALOG_CACHE_TTL_MS = 60_000;

let cachedKnowledge: { snapshot: StoreKnowledgeSnapshot; expiresAt: number } | null = null;

export function invalidateAiCatalogCache(): void {
  cachedKnowledge = null;
}

function getAiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function extractFriendlyAiError(err: unknown): {
  status: number;
  message: string;
} {
  const raw = err instanceof Error ? err.message : String(err ?? 'AI request failed.');
  let parsedMsg = raw;
  let code = 500;

  try {
    const obj = JSON.parse(raw) as { error?: { code?: number; message?: string; status?: string } };
    if (obj?.error?.message) {
      parsedMsg = obj.error.message;
    }
    if (typeof obj?.error?.code === 'number') {
      code = obj.error.code;
    }
  } catch {
    // not JSON
  }

  const lower = parsedMsg.toLowerCase();
  if (lower.includes('api_key') || lower.includes('not configured') || code === 403) {
    return {
      status: code === 403 ? 403 : 503,
      message: parsedMsg,
    };
  }
  if (code === 429 || lower.includes('quota') || lower.includes('resource_exhausted')) {
    return { status: 429, message: parsedMsg };
  }
  if (code === 503 || lower.includes('high demand') || lower.includes('unavailable')) {
    return { status: 503, message: parsedMsg };
  }
  if (code >= 400 && code < 500) {
    return { status: code, message: parsedMsg };
  }
  return { status: 500, message: parsedMsg };
}

export function normalizeChatHistory(raw: unknown): ChatHistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: ChatHistoryTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const role = obj.role === 'model' ? 'model' : obj.role === 'user' ? 'user' : null;
    const text = typeof obj.text === 'string' ? obj.text.trim() : '';
    if (role && text) {
      cleaned.push({ role, text: text.slice(0, 1000) });
    }
  }
  return cleaned.slice(-8);
}

export function matchCatalogProductsByIds(
  products: CatalogProductSummary[],
  matchedIds: unknown,
  maxItems: number = 24
): CatalogProductSummary[] {
  if (!Array.isArray(matchedIds)) return [];
  const byId = new Map<string, CatalogProductSummary>();
  for (const p of products) {
    byId.set(p.id.toLowerCase(), p);
  }
  const seen = new Set<string>();
  const resolved: CatalogProductSummary[] = [];
  for (const rawId of matchedIds) {
    const key = String(rawId ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    const found = byId.get(key);
    if (found) {
      seen.add(key);
      resolved.push(found);
      if (resolved.length >= maxItems) break;
    }
  }
  return resolved;
}

export function filterCatalogByPriceRange(
  products: CatalogProductSummary[],
  minPrice?: number,
  maxPrice?: number
): CatalogProductSummary[] {
  return products.filter((p) => {
    const prices = [p.price, ...(p.variants?.map((v) => v.price) ?? [])];
    return prices.some((val) => {
      if (minPrice !== undefined && val < minPrice) return false;
      if (maxPrice !== undefined && val > maxPrice) return false;
      return true;
    });
  });
}

export async function loadLiveStoreKnowledge(forceRefresh = false): Promise<StoreKnowledgeSnapshot> {
  if (!forceRefresh && cachedKnowledge && Date.now() < cachedKnowledge.expiresAt) {
    return cachedKnowledge.snapshot;
  }

  const [catRes, prodRes, varRes, couponRes, areaRes] = await Promise.all([
    pool.query('SELECT slug, name, name_bn, description FROM categories ORDER BY sort_order ASC, slug ASC'),
    pool.query('SELECT * FROM products ORDER BY created_at DESC, id ASC'),
    pool.query('SELECT product_id, label, label_bn, price, original_price FROM product_variants ORDER BY sort_order ASC, id ASC'),
    pool.query(
      'SELECT code, type, value, min_subtotal, max_discount, description, description_bn FROM coupons WHERE active = TRUE ORDER BY created_at DESC'
    ),
    pool.query('SELECT id, name, name_bn, fee, free_threshold, eta, eta_bn FROM delivery_areas ORDER BY sort_order ASC'),
  ]);

  const catNameBySlug = new Map<string, { name: string; nameBn: string }>();
  const categories = catRes.rows.map((c) => {
    const slug = String(c.slug);
    const name = String(c.name);
    const nameBn = String(c.name_bn);
    catNameBySlug.set(slug, { name, nameBn });
    return {
      slug,
      name,
      nameBn,
      description: String(c.description ?? ''),
    };
  });

  const variantsByProduct = new Map<
    string,
    Array<{ label: string; labelBn?: string; price: number; originalPrice?: number }>
  >();
  for (const v of varRes.rows) {
    const pid = String(v.product_id);
    if (!variantsByProduct.has(pid)) variantsByProduct.set(pid, []);
    variantsByProduct.get(pid)!.push({
      label: String(v.label),
      labelBn: v.label_bn ? String(v.label_bn) : undefined,
      price: Number(v.price),
      originalPrice: v.original_price != null ? Number(v.original_price) : undefined,
    });
  }

  const products: CatalogProductSummary[] = prodRes.rows.map((p) => {
    const id = String(p.id);
    const catSlug = String(p.category_slug);
    const catMeta = catNameBySlug.get(catSlug);
    const variants = variantsByProduct.get(id);
    return {
      id,
      slug: String(p.slug),
      name: String(p.name),
      nameBn: String(p.name_bn),
      brand: String(p.brand),
      brandBn: String(p.brand_bn),
      category: catSlug,
      categoryName: catMeta?.name ?? catSlug,
      categoryNameBn: catMeta?.nameBn ?? catSlug,
      price: Number(p.price),
      originalPrice: p.original_price != null ? Number(p.original_price) : undefined,
      unit: String(p.unit),
      unitBn: String(p.unit_bn),
      inStock: Boolean(p.in_stock),
      stockCount: Number(p.stock_count),
      image: String(p.image_url),
      description: String(p.description ?? ''),
      descriptionBn: String(p.description_bn ?? ''),
      variants: variants && variants.length > 0 ? variants : undefined,
    };
  });

  const coupons = couponRes.rows.map((c) => ({
    code: String(c.code),
    type: String(c.type),
    value: Number(c.value),
    minSubtotal: Number(c.min_subtotal ?? 0),
    maxDiscount: c.max_discount != null ? Number(c.max_discount) : undefined,
    description: String(c.description ?? ''),
    descriptionBn: String(c.description_bn ?? ''),
  }));

  const deliveryAreas = areaRes.rows.map((a) => ({
    id: String(a.id),
    name: String(a.name),
    nameBn: String(a.name_bn),
    fee: Number(a.fee),
    freeOver: Number(a.free_threshold),
    eta: String(a.eta),
    etaBn: String(a.eta_bn),
  }));

  const snapshot = { categories, products, coupons, deliveryAreas };
  cachedKnowledge = {
    snapshot,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
  };
  return snapshot;
}

export function buildCatalogPromptContext(snapshot: StoreKnowledgeSnapshot): string {
  const compactProducts = snapshot.products.map((p) => ({
    id: p.id,
    n: p.name,
    bn: p.nameBn,
    b: p.brand,
    c: p.category,
    p: p.price,
    ...(p.originalPrice ? { op: p.originalPrice } : {}),
    u: p.unit,
    s: p.inStock ? 1 : 0,
    q: p.stockCount,
    ...(p.variants?.length ? { v: p.variants.map((v) => `${v.label}:${v.price}`) } : {}),
  }));

  return JSON.stringify({
    store: {
      name: 'Avado Grocery (অ্যাভাডো গ্রোসারি)',
      loc: 'Uttara Sector 11, Dhaka',
      hours: '7 AM–11 PM daily',
      phone: '01722371905',
      pay: ['COD', 'bKash', 'Nagad', 'Card'],
    },
    delivery: snapshot.deliveryAreas.map((a) => ({
      n: a.name,
      fee: a.fee,
      freeOver: a.freeOver,
      eta: a.eta,
    })),
    promos: snapshot.coupons.map((c) => ({
      code: c.code,
      type: c.type,
      val: c.value,
      min: c.minSubtotal,
      max: c.maxDiscount,
    })),
    cats: snapshot.categories.map((c) => ({ s: c.slug, n: c.name, bn: c.nameBn })),
    prods: compactProducts,
  });
}

export async function normalizeUploadedChatImage(
  buffer: Buffer,
  mimeType: string
): Promise<{ data: string; mimeType: string }> {
  try {
    const normalized = await sharp(buffer)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { data: normalized.toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    return {
      data: buffer.toString('base64'),
      mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
    };
  }
}

export async function runStoreAiChat(params: {
  message: string;
  lang?: 'en' | 'bn';
  history?: ChatHistoryTurn[];
  image?: { buffer: Buffer; mimeType: string } | null;
}): Promise<StoreChatResult> {
  const snapshot = await loadLiveStoreKnowledge();
  const catalogJson = buildCatalogPromptContext(snapshot);
  const ai = getAiClient();

  const systemInstruction = `You are Avado AI for Avado Grocery (Uttara, Dhaka). Use ONLY this live database (keys: n=name, bn=Bengali, b=brand, c=category slug, p=price BDT, u=unit, s=1 inStock/0 out, q=qty, v=variants):
${catalogJson}

RULES:
1. Language: Reply in Bengali if customer writes Bengali/Banglish (or app lang is 'bn' unless query is English), else English.
2. Concise Reply: Keep \`reply\` short (1-3 crisp sentences). Do NOT list every item line-by-line when \`matchedProductIds\` returns product cards—just summarize clearly.
3. Category/Budget: For category queries ("fol", "fruits") or price range queries ("100-250 taka", checking both \`p\` and \`v\`), return ALL matching IDs in \`matchedProductIds\` (up to 24).
4. Photo: Identify item in \`detectedItemName\` and return matching catalog IDs in \`matchedProductIds\`.
5. Never invent products, prices, or promo codes.`;

  const historyText =
    params.history && params.history.length > 0
      ? `History:\n${params.history
          .map((h) => `${h.role === 'user' ? 'U' : 'A'}: ${h.text}`)
          .join('\n')}\n\n`
      : '';

  const userPromptText = `${historyText}Lang:${params.lang === 'bn' ? 'bn' : 'en'} | Msg: ${
    params.message.trim() ||
    (params.image
      ? 'Identify this product from the photo and show store matches.'
      : 'Hello')
  }`;

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (params.image) {
    const normalizedImg = await normalizeUploadedChatImage(
      params.image.buffer,
      params.image.mimeType
    );
    parts.push({
      inlineData: {
        mimeType: normalizedImg.mimeType,
        data: normalizedImg.data,
      },
    });
  }
  parts.push({ text: userPromptText });

  const modelsToTry: Array<{ model: string; thinkingLevel: ThinkingLevel; delayMs: number }> = [
    { model: FAST_AI_MODEL, thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 0 },
    { model: FALLBACK_AI_MODEL, thinkingLevel: ThinkingLevel.LOW, delayMs: 250 },
    { model: FAST_AI_MODEL, thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 600 },
  ];

  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
  let lastError: unknown = null;

  for (const attempt of modelsToTry) {
    if (attempt.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt.delayMs));
    }
    try {
      response = await ai.models.generateContent({
        model: attempt.model,
        contents: { parts },
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Helpful customer-facing response in Bengali or English.',
              },
              detectedItemName: {
                type: Type.STRING,
                description: 'Short name of the item identified if an image was provided, otherwise empty string.',
              },
              matchedProductIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Exact product IDs from LIVE DATABASE KNOWLEDGE matching the user query or uploaded photo.',
              },
            },
            required: ['reply', 'matchedProductIds'],
          },
        },
      });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      const msg = (err as Error)?.message ?? '';
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('high demand');
      if (!isTransient) {
        throw err;
      }
    }
  }

  if (!response) {
    throw lastError instanceof Error
      ? lastError
      : new Error('AI service is temporarily busy. Please try again in a moment.');
  }

  const rawJson = (response.text ?? '').trim();
  let parsed: {
    reply?: string;
    detectedItemName?: string;
    matchedProductIds?: string[];
  } = {};

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    parsed = {
      reply: rawJson || 'Sorry, I could not understand that request. Please try again.',
      matchedProductIds: [],
    };
  }

  const matchedProducts = matchCatalogProductsByIds(
    snapshot.products,
    parsed.matchedProductIds,
    24
  );

  return {
    reply:
      (parsed.reply ?? '').trim() ||
      (params.lang === 'bn'
        ? 'আপনার অনুরোধের পণ্যগুলো নিচে দেখানো হলো।'
        : 'Here are the matching items from Avado Grocery.'),
    detectedItemName: parsed.detectedItemName?.trim() || undefined,
    products: matchedProducts,
  };
}
