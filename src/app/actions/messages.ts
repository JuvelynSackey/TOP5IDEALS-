"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, fromDbError, ok, type ActionResult } from "@/lib/errors";
import { messageSchema } from "@/lib/validation/marketplace";

export interface SentMessage {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  client_id: string;
  created_at: string;
}

export async function sendMessageAction(input: unknown): Promise<ActionResult<SentMessage>> {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", parsed.error.issues[0]?.message ?? "Invalid message.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_message", {
    p_conversation_id: parsed.data.conversationId,
    p_body: parsed.data.body,
    p_client_id: parsed.data.clientId,
  });
  if (error || !data) return fromDbError(error ?? {}, "Your message wasn't sent. Tap to retry.");
  return ok(data);
}

export async function markConversationReadAction(conversationId: unknown): Promise<void> {
  const id = z.uuid().safeParse(conversationId);
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc("mark_conversation_read", { p_conversation_id: id.data });
}
