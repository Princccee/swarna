import { Role, Metal, Purity } from './enums';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ResponseDto<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ErrorResponse {
  statusCode: number;
  message: string;
  errors?: Array<{ field: string; message: string }>;
  timestamp: string;
  path?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterUserDto {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: Role;
  };
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface RateDto {
  metal: Metal;
  purity: Purity;
  ratePerGram: string;
  snappedAt: string;
}

export interface ItemSummaryDto {
  id: string;
  sku: string;
  name: string;
  purity: Purity;
  grossWeightG: string;
  netWeightG: string;
  huid?: string;
  stockQty: number;
  imageUrls: string[];
  active: boolean;
}

export interface InvoiceLineDto {
  itemId: string;
  qty: number;
  netWeightG?: string;
}

export interface PricingPreviewRequest {
  items: InvoiceLineDto[];
  oldGoldWeightG?: string;
  oldGoldRatePerGram?: string;
  customerId?: string;
}
