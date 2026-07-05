/** Re-export legado — implementação em quotaService.ts */
export {
  QuotaExceededError,
  consumeCloudTurn,
  consumeQuota,
  getQuotaSnapshot,
  type QuotaUsageSnapshot,
  type TurnQuotaSnapshot,
} from "./quotaService.js";
