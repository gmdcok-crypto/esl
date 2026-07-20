export type AimsLabelStatus = "online" | "offline" | "low_battery" | "unknown";

export interface AimsProduct {
  id: string;
  sku: string;
  name: string;
  price: number;
  currency?: string;
  unit?: string;
  barcode?: string;
  promotionPrice?: number;
  stock?: number;
  updatedAt?: string;
}

export interface AimsLabel {
  id: string;
  macAddress?: string;
  productId?: string;
  templateId?: string;
  status: AimsLabelStatus;
  batteryLevel?: number;
  lastSeenAt?: string;
}

export interface AimsStore {
  id: string;
  name: string;
  gatewayCount?: number;
  labelCount?: number;
}

export interface AimsApiError {
  responseCode?: string | number;
  responseMessage?: string | unknown;
  code?: string;
  message?: string;
  details?: unknown;
}

export interface AimsListResponse<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface UpdateProductPayload {
  sku: string;
  name?: string;
  price: number;
  currency?: string;
  unit?: string;
  barcode?: string;
  promotionPrice?: number;
  stock?: number;
}

export interface AssignLabelPayload {
  labelId: string;
  productId: string;
  templateId?: string;
}
