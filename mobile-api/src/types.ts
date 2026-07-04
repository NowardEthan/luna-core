import { z } from "zod";

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(16_000),
  sessionId: z.string().min(1).max(128).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type ChatResponseOk = {
  ok: true;
  text: string;
  sessionId: string;
  turnCount: number;
};

export type ChatResponseErr = {
  ok: false;
  error: string;
};

export type ChatResponse = ChatResponseOk | ChatResponseErr;

export type HealthResponse = {
  ok: true;
  service: "luna-mobile-api";
  corePath: string;
  coreReady: boolean;
};
