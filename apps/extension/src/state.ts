import { z } from 'zod';
import {
  ContextSchema,
  ExportSchema,
} from '../../../packages/shared/src/schema';
export const TaskSchema = z
  .object({
    id: z.string(),
    tabId: z.number().int(),
    documentId: z.string().min(1).optional(),
    context: ContextSchema,
    status: z.enum([
      'running',
      'blocked',
      'failed',
      'cancelled',
      'interrupted',
      'done',
    ]),
    updatedAt: z.number(),
    message: z.string(),
    count: z.number().int().nonnegative(),
    result: ExportSchema.optional(),
  })
  .strict();
export type Task = z.infer<typeof TaskSchema>;
export function recover(task: Task, now: number): Task {
  return task.status === 'running' && now - task.updatedAt > 15000
    ? {
        ...task,
        status: 'interrupted',
        message: 'Task interrupted. Retry extraction.',
        updatedAt: now,
      }
    : task;
}
export function accept(task: Task, id: string) {
  return task.id === id && task.status === 'running';
}
