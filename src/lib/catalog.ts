import type { Enums } from "@/lib/supabase/database.types";

export type ListingCondition = Enums<"listing_condition">;
export type ListingStatus = Enums<"listing_status">;
export type ModerationStatus = Enums<"moderation_status">;
export type NetworkLock = Enums<"network_lock_status">;
export type BatteryHealthStatus = Enums<"battery_health_status">;
export type OfferStatus = Enums<"offer_status">;
export type TransactionStatus = Enums<"transaction_status">;
export type AccountType = Enums<"account_type">;
export type ReportReason = Enums<"report_reason">;
export type DisputeCategory = Enums<"dispute_category">;
export type NotificationType = Enums<"notification_type">;

export const CONDITIONS: { value: ListingCondition; label: string; description: string }[] = [
  { value: "new", label: "New", description: "Sealed or never used." },
  { value: "like_new", label: "Like New", description: "No visible signs of use." },
  { value: "excellent", label: "Excellent", description: "Minimal, hard-to-see wear." },
  { value: "good", label: "Good", description: "Light visible wear, fully working." },
  { value: "fair", label: "Fair", description: "Noticeable wear or minor issues described." },
  { value: "refurbished", label: "Refurbished", description: "Repaired or restored by a seller or shop." },
];

export const CONDITION_LABEL = Object.fromEntries(CONDITIONS.map((c) => [c.value, c.label])) as Record<ListingCondition, string>;

export const ACCESSORIES = [
  { value: "original_box", label: "Original box" },
  { value: "charger", label: "Charger" },
  { value: "cable", label: "Cable" },
  { value: "receipt", label: "Receipt" },
  { value: "warranty_card", label: "Warranty card" },
  { value: "case", label: "Case" },
  { value: "earphones", label: "Earphones" },
  { value: "screen_protector", label: "Screen protector" },
] as const;
export type Accessory = (typeof ACCESSORIES)[number]["value"];
export const ACCESSORY_VALUES = ACCESSORIES.map((a) => a.value) as [Accessory, ...Accessory[]];
export const ACCESSORY_LABEL: Record<string, string> = Object.fromEntries(ACCESSORIES.map((a) => [a.value, a.label]));

export const DEVICE_CHECKS = [
  { key: "display", label: "Display" },
  { key: "touch", label: "Touchscreen" },
  { key: "cameras", label: "Cameras" },
  { key: "biometrics", label: "Face ID / fingerprint" },
  { key: "speakers", label: "Speakers" },
  { key: "microphone", label: "Microphone" },
  { key: "charging", label: "Charging" },
  { key: "wifi_bluetooth", label: "Wi-Fi & Bluetooth" },
  { key: "cellular", label: "Calls & mobile data" },
  { key: "buttons", label: "Buttons" },
] as const;
export type DeviceCheckKey = (typeof DEVICE_CHECKS)[number]["key"];
export const DEVICE_CHECK_KEYS = DEVICE_CHECKS.map((d) => d.key) as [DeviceCheckKey, ...DeviceCheckKey[]];
export type DeviceCheckValue = "working" | "faulty" | "not_tested";
export const DEVICE_CHECK_VALUES: { value: DeviceCheckValue; label: string }[] = [
  { value: "not_tested", label: "Not tested" },
  { value: "working", label: "Working" },
  { value: "faulty", label: "Faulty" },
];

export const NETWORK_LOCK_LABEL: Record<NetworkLock, string> = {
  unlocked: "Unlocked (any network)",
  locked: "Network locked",
  unknown: "Not sure",
};

export const STORAGE_CHOICES = [16, 32, 64, 128, 256, 512, 1024, 2048];
export const RAM_CHOICES = [2, 3, 4, 6, 8, 12, 16];

export function formatStorage(gb: number | null | undefined): string {
  if (!gb) return "";
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024}TB` : `${gb}GB`;
}

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "fraud", label: "Scam or fraud" },
  { value: "stolen_device", label: "Possibly stolen device" },
  { value: "counterfeit", label: "Counterfeit or fake" },
  { value: "misleading", label: "Misleading description or photos" },
  { value: "prohibited_item", label: "Prohibited item" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
];

export const DISPUTE_CATEGORIES: { value: DisputeCategory; label: string }[] = [
  { value: "no_show", label: "The other party did not show up" },
  { value: "not_as_described", label: "Phone was not as described" },
  { value: "other_party_unresponsive", label: "The other party stopped responding or will not confirm" },
  { value: "payment_issue", label: "Problem with the cash payment" },
  { value: "suspected_fraud", label: "I suspect fraud" },
  { value: "other", label: "Something else" },
];

export const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: "Under GH₵1,000", max: 100_000 },
  { label: "GH₵1,000 – 3,000", min: 100_000, max: 300_000 },
  { label: "GH₵3,000 – 6,000", min: 300_000, max: 600_000 },
  { label: "GH₵6,000 – 10,000", min: 600_000, max: 1_000_000 },
  { label: "Over GH₵10,000", min: 1_000_000 },
];
