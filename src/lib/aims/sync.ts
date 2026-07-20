import { z } from "zod";
import { getAimsClient } from "@/lib/aims/client";
import { isAimsConfigured } from "@/lib/config";

const updateProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().optional(),
  price: z.number().nonnegative(),
  currency: z.string().default("KRW"),
  unit: z.string().optional(),
  barcode: z.string().optional(),
  promotionPrice: z.number().nonnegative().optional(),
  stock: z.number().int().optional(),
});

export async function syncProductFromPos(input: unknown) {
  if (!isAimsConfigured()) {
    throw new Error("AIMS is not configured. Set AIMS_BASE_URL and AIMS_API_KEY.");
  }

  const payload = updateProductSchema.parse(input);
  const aims = getAimsClient();
  return aims.upsertProduct(payload);
}

export async function syncProductsFromPos(items: unknown[]) {
  const results = [];
  for (const item of items) {
    results.push(await syncProductFromPos(item));
  }
  return results;
}
