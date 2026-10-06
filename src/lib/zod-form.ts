import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

/**
 * zod resolver for forms whose schema transforms values (text → null, "a, b" → ["a", "b"]).
 * The form holds the schema's input type and `handleSubmit` receives its output type:
 * `useForm<z.input<S>, unknown, z.output<S>>({ resolver: zodForm(schema) })`.
 */
export function zodForm<S extends z.ZodTypeAny>(schema: S) {
  return zodResolver(schema) as unknown as Resolver<z.input<S> & FieldValues, unknown, z.output<S>>;
}
