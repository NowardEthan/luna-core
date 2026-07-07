/** Re-export legado — implementação em quotaService.ts */
export {
  QuotaExceededError,
  assertTokensAvailable,
  consumeCloudTurn,
  consumeQuota,
  consumeTokens,
  getQuotaSnapshot,
  type QuotaUsageSnapshot,
  type TurnQuotaSnapshot,
  type WeeklyTokensSnapshot,
} from "./quotaService.js";
