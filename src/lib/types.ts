export type ProductCondition = "Nuevo" | "Reacondicionado" | "Usado";
export type ProductStatus =
  "Disponible" | "Últimas unidades" | "Sin stock" | "Consultar disponibilidad";

export type Product = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  categorySlug: string;
  brand: string;
  model: string;
  price: number;
  previousPrice?: number;
  condition: ProductCondition;
  status: ProductStatus;
  image?: string;
  images: string[];
  featured?: boolean;
  isNewArrival?: boolean;
  isOffer?: boolean;
  shipping: boolean;
  pickup: boolean;
  warranty: string;
  specifications: Record<string, string>;
  board?: {
    code: string;
    partNumber?: string;
    type: string;
    compatibleModels: string[];
  };
};

export type CatalogSort = "recent" | "price-asc" | "price-desc" | "name";

export type CatalogCategory = {
  name: string;
  slug: string;
  count: number;
};

export type CatalogCondition = {
  value: ProductCondition;
  count: number;
};

export type CatalogQuery = {
  categorySlug?: string;
  condition?: ProductCondition;
  search?: string;
  sort?: CatalogSort;
  page?: number;
  pageSize?: number;
};

export type CatalogResult = {
  products: Product[];
  categories: CatalogCategory[];
  conditions: CatalogCondition[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CartItem = { product: Product; quantity: number };
