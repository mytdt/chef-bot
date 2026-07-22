export type SupplyCategory = "burger" | "cheese" | "sauce" | "potato" | "flavors_house";

export type VerificationType = "expected_numeric" | "binary" | "value_range" | "expiration" | "photo_evidence";

export type Frequency = "daily" | "every_n_days" | "weekly" | "monthly";

export type Criticality = "low" | "medium" | "high";

export type MovementType = "receipt" | "sale" | "waste";

export type MovementSource = "manual" | "3scheckout_api" | "xml_drive";

// C5/D10: which LLM actually produced the structured parse for a given Count —
// "claude" is primary, "gemini" only appears when the fallback kicked in.
export type LlmProvider = "claude" | "gemini";
