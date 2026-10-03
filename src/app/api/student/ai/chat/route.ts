import { createRouteHandler, jsonOk } from '@/lib/api';
import { chatMessageSchema } from '@/lib/validation';
import { requireStudent } from '@/server/auth/guards';
import { sendChatMessage } from '@/server/services/studentExperienceService';

/**
 * POST /api/student/ai/chat
 * The student identity comes from the session only. The AI receives nothing
 * except the conversation of the current experiment.
 */
export const POST = createRouteHandler({
  body: chatMessageSchema,
  handler: async (request, _context, input) => {
    const { studentId } = await requireStudent();
    const exchange = await sendChatMessage(studentId, input.content, request);

    return jsonOk({
      studentMessage: {
        id: exchange.studentMessage.id,
        content: exchange.studentMessage.content,
        createdAt: exchange.studentMessage.createdAt.toISOString(),
      },
      assistantMessage: {
        id: exchange.assistantMessage.id,
        content: exchange.assistantMessage.content,
        createdAt: exchange.assistantMessage.createdAt.toISOString(),
      },
    });
  },
});