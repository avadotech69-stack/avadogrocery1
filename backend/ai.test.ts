import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalogPromptContext,
  extractFriendlyAiError,
  filterCatalogByPriceRange,
  matchCatalogProductsByIds,
  normalizeChatHistory,
  type CatalogProductSummary,
} from './ai';

const SAMPLE_PRODUCTS: CatalogProductSummary[] = [
  {
    id: 'fr-01',
    slug: 'rajshahi-himsagar-mango',
    name: 'Rajshahi Himsagar Mango',
    nameBn: 'রাজশাহীর হিমসাগর আম',
    brand: 'Avado Fresh',
    brandBn: 'অ্যাভাডো ফ্রেশ',
    category: 'fruits',
    categoryName: 'Fresh Fruits',
    categoryNameBn: 'তাজা ফল',
    price: 180,
    originalPrice: 220,
    unit: '1 kg',
    unitBn: '১ কেজি',
    inStock: true,
    stockCount: 40,
    image: 'https://example.com/mango.webp',
    description: 'Sweet Rajshahi mango',
    descriptionBn: 'মিষ্টি রাজশাহীর আম',
  },
  {
    id: 'rg-01',
    slug: 'aci-miniket-rice',
    name: 'ACI Pure Miniket Rice',
    nameBn: 'এসিআই পিওর মিনিকেট চাল',
    brand: 'ACI Pure',
    brandBn: 'এসিআই পিওর',
    category: 'rice-grains',
    categoryName: 'Cooking & Rice',
    categoryNameBn: 'চাল ও রান্না',
    price: 390,
    unit: '5 kg',
    unitBn: '৫ কেজি',
    inStock: true,
    stockCount: 25,
    image: 'https://example.com/rice.webp',
    description: 'Premium Miniket rice',
    descriptionBn: 'প্রিমিয়াম মিনিকেট চাল',
    variants: [
      { label: '2 kg', price: 165 },
      { label: '5 kg', price: 390 },
    ],
  },
];

test('matchCatalogProductsByIds deduplicates and filters invalid IDs', () => {
  const matched = matchCatalogProductsByIds(SAMPLE_PRODUCTS, ['FR-01', 'unknown', 'fr-01', 'rg-01']);
  assert.equal(matched.length, 2);
  assert.equal(matched[0].id, 'fr-01');
  assert.equal(matched[1].id, 'rg-01');
});

test('filterCatalogByPriceRange matches base price and variant prices', () => {
  const range100to200 = filterCatalogByPriceRange(SAMPLE_PRODUCTS, 100, 200);
  assert.deepEqual(
    range100to200.map((p) => p.id),
    ['fr-01', 'rg-01']
  );

  const range300to450 = filterCatalogByPriceRange(SAMPLE_PRODUCTS, 300, 450);
  assert.deepEqual(
    range300to450.map((p) => p.id),
    ['rg-01']
  );
});

test('normalizeChatHistory keeps valid recent turns only', () => {
  const turns = normalizeChatHistory([
    { role: 'user', text: '  hello  ' },
    { role: 'invalid', text: 'ignore' },
    { role: 'model', text: '' },
    { role: 'model', text: 'Hi there!' },
  ]);
  assert.deepEqual(turns, [
    { role: 'user', text: 'hello' },
    { role: 'model', text: 'Hi there!' },
  ]);
});

test('buildCatalogPromptContext serializes live categories, products, coupons, and delivery areas', () => {
  const json = buildCatalogPromptContext({
    categories: [{ slug: 'fruits', name: 'Fresh Fruits', nameBn: 'তাজা ফল', description: 'Mangoes' }],
    products: SAMPLE_PRODUCTS,
    coupons: [
      {
        code: 'AVADO10',
        type: 'percent',
        value: 10,
        minSubtotal: 500,
        description: '10% off',
        descriptionBn: '১০% ছাড়',
      },
    ],
    deliveryAreas: [
      {
        id: 'uttara',
        name: 'Uttara',
        nameBn: 'উত্তরা',
        fee: 40,
        freeOver: 1500,
        eta: '45-60 mins',
        etaBn: '৪৫-৬০ মিনিট',
      },
    ],
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.prods.length, 2);
  assert.equal(parsed.promos[0].code, 'AVADO10');
  assert.equal(parsed.delivery[0].n, 'Uttara');
});

test('extractFriendlyAiError parses JSON SDK errors and status codes cleanly', () => {
  const err503 = extractFriendlyAiError(
    new Error(JSON.stringify({ error: { code: 503, message: 'High demand', status: 'UNAVAILABLE' } }))
  );
  assert.equal(err503.status, 503);
  assert.equal(err503.message, 'High demand');

  const missingKey = extractFriendlyAiError(new Error('GEMINI_API_KEY is not configured'));
  assert.equal(missingKey.status, 503);
});

