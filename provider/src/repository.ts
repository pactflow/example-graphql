/**
 * The provider's data, held in memory.
 *
 * It is mutable and resettable so that provider state handlers can put the server into the exact
 * state a consumer's `given(...)` describes. In a real provider this is your database, and the
 * state handlers seed it the same way.
 */

export type ProductStatus = 'ACTIVE' | 'DRAFT' | 'OUT_OF_STOCK' | 'ARCHIVED';
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'AUD';

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface Variant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price: { list: Money; sale: Money | null };
  inventory: { quantity: number; updatedAt: string };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  type: string;
  name: string;
  sku: string;
  description: string | null;
  status: ProductStatus;
  categoryId: string | null;
  tags: string[];
}

const CARDS: Category = { id: 'cat-1', name: 'Cards', slug: 'cards' };
const LOANS: Category = { id: 'cat-2', name: 'Loans', slug: 'loans' };

/** The default catalogue the server starts with, and what `reset()` restores. */
function seed() {
  const categories: Category[] = [CARDS, LOANS];

  const products: Product[] = [
    {
      id: '09',
      type: 'CREDIT_CARD',
      name: 'Gem Visa',
      sku: 'SKU-GEM-VISA',
      description: 'A credit card for everyday spending',
      status: 'ACTIVE',
      categoryId: 'cat-1',
      tags: ['finance', 'credit'],
    },
    {
      id: '10',
      type: 'CREDIT_CARD',
      name: 'GoodLife Card',
      sku: 'SKU-GOODLIFE',
      description: 'Interest free terms on everyday purchases',
      status: 'ACTIVE',
      categoryId: 'cat-1',
      tags: ['finance', 'credit'],
    },
    {
      id: '11',
      type: 'PERSONAL_LOAN',
      name: '28 Degrees',
      sku: 'SKU-28-DEGREES',
      description: null,
      status: 'DRAFT',
      categoryId: 'cat-2',
      tags: ['finance'],
    },
  ];

  const variants: Variant[] = [
    {
      id: 'var-1',
      productId: '10',
      sku: 'SKU-GEM-VISA-STD',
      name: 'Gem Visa - Standard',
      price: { list: { amount: 0.0, currency: 'AUD' }, sale: null },
      inventory: { quantity: 100, updatedAt: '2026-01-01T00:00:00Z' },
    },
    {
      id: 'var-2',
      productId: '09',
      sku: 'SKU-GEM-VISA-PLUS',
      name: 'Gem Visa - Plus',
      price: {
        list: { amount: 49.0, currency: 'AUD' },
        sale: { amount: 29.0, currency: 'AUD' },
      },
      inventory: { quantity: 12, updatedAt: '2026-01-01T00:00:00Z' },
    },
  ];

  return { categories, products, variants };
}

let state = seed();
let cartLineSequence = 0;

export const repository = {
  reset() {
    state = seed();
    cartLineSequence = 0;
  },

  categories: () => state.categories,

  findCategory: (id: string | null) =>
    id ? (state.categories.find((category) => category.id === id) ?? null) : null,

  findProduct: (id: string) => state.products.find((product) => product.id === id) ?? null,

  listProducts(status?: ProductStatus | null, first?: number | null) {
    const matching = status
      ? state.products.filter((product) => product.status === status)
      : [...state.products];
    return typeof first === 'number' ? matching.slice(0, first) : matching;
  },

  variantsFor: (productId: string) =>
    state.variants.filter((variant) => variant.productId === productId),

  findVariant: (id: string) => state.variants.find((variant) => variant.id === id) ?? null,

  upsertProduct(product: Product) {
    const index = state.products.findIndex((existing) => existing.id === product.id);
    if (index === -1) {
      state.products.push(product);
    } else {
      state.products[index] = product;
    }
  },

  removeProduct(id: string) {
    state.products = state.products.filter((product) => product.id !== id);
    state.variants = state.variants.filter((variant) => variant.productId !== id);
  },

  upsertVariant(variant: Variant) {
    const index = state.variants.findIndex((existing) => existing.id === variant.id);
    if (index === -1) {
      state.variants.push(variant);
    } else {
      state.variants[index] = variant;
    }
  },

  nextCartLineId: () => `line-${++cartLineSequence}`,
};
