export type ProductCondition = "Nuevo" | "Reacondicionado" | "Usado" | "Usado seleccionado" | "Repuesto";
export type ProductStatus =
  "Disponible" | "Últimas unidades" | "Sin stock" | "Consultar disponibilidad";
export type ShippingSize = "chico" | "mediano" | "grande" | "no_viaja";

export type Product = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  categorySlug: string;
  family: string;
  familyName: string;
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
  /** Texto de garantía listo para mostrar: "Garantía de 6 meses". */
  warranty: string;
  warrantyMonths: number;
  /** true cuando el plazo es el mínimo de la Ley 24.240 porque todavía no se cargó otro. */
  warrantyIsLegalMinimum: boolean;
  shippingSize?: ShippingSize;
  videoUrl?: string;
  boxContents?: string;
  compatibleWith: string[];
  /** 1 = el más vendido en el local en los últimos 90 días. */
  popularityRank?: number;
  publishedAt?: string;
  specifications: Record<string, string>;
  board?: {
    code: string;
    partNumber?: string;
    type: string;
    compatibleModels: string[];
  };
};

export type CatalogSort = "popular" | "recent" | "price-asc" | "price-desc" | "name";

export type CatalogFamily = {
  slug: string;
  name: string;
  count: number;
};

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
  family?: string;
  categorySlug?: string;
  need?: string;
  compat?: string;
  condition?: ProductCondition;
  priceRange?: string;
  search?: string;
  /** Solo lo que hay en stock para llevar hoy. */
  availableToday?: boolean;
  sort?: CatalogSort;
  page?: number;
  pageSize?: number;
};

export type CatalogResult = {
  products: Product[];
  families: CatalogFamily[];
  categories: CatalogCategory[];
  conditions: CatalogCondition[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Productos que coinciden pero no se muestran porque todavía no tienen foto. */
  hiddenWithoutPhoto: number;
  /** De lo que coincide (antes del filtro de stock), cuántos se pueden llevar hoy y cuántos no. */
  stock: { available: number; unavailable: number };
};

export type CartItem = { product: Product; quantity: number };
