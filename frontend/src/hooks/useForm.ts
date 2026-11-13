import { useCallback, useEffect, useRef, useState } from 'react';
import { mapFieldErrors } from '../lib/validate.ts';

/**
 * Request lifecycle for a form: idle → submitting → success (parent closes the dialog) | error (values kept).
 * `onSubmit(values)` must resolve to { ok, inline?, error? } like the actions in useActions.
 */
type FormErrors = Record<string, string | undefined>;
export function useForm({ validate, onSubmit }: { validate?: (values: any) => FormErrors; onSubmit: (values: any) => any }) {
  const formRef = useRef<HTMLFormElement>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  useEffect(() => () => { mounted.current = false; }, []);

  const focusFirstInvalid = () => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  const clearError = useCallback((name: string) => setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current)), []);

  const handleSubmit = useCallback(async (event: any, values: any) => {
    event?.preventDefault();
    if (busy.current) return; // hard guard against double-submits (double click / Enter twice)
    const found = validate ? validate(values) : {};
    setErrors(found);
    setServerError('');
    if (Object.keys(found).length) { focusFirstInvalid(); return; }
    busy.current = true;
    setSubmitting(true);
    const result = await onSubmit(values);
    busy.current = false;
    if (!mounted.current) return;
    setSubmitting(false);
    if (result && !result.ok && result.inline) {
      const mapped = mapFieldErrors(result.error?.fieldErrors);
      setErrors(mapped);
      setServerError(Object.keys(mapped).length ? 'Please fix the highlighted fields.' : result.error?.message || 'This could not be saved.');
      focusFirstInvalid();
    }
  }, [validate, onSubmit]);

  return { formRef, submitting, errors, serverError, clearError, handleSubmit };
}
