import * as React from "react";

const fieldClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black disabled:bg-gray-100";

type FieldProps = {
  label: string;
  error?: string | null;
  hint?: string;
};

// Label, control, hint and error wired together for screen readers (aria-describedby / aria-invalid).
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  function Input({ label, error, hint, id, className = "", ...props }, ref) {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const describedBy = [error ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null].filter(Boolean).join(" ");
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium text-gray-800">
          {label}
        </label>
        <input
          {...props}
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`${fieldClass} ${className}`.trim()}
        />
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-gray-500">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(
  function Textarea({ label, error, hint, id, className = "", ...props }, ref) {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium text-gray-800">
          {label}
        </label>
        <textarea
          {...props}
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={`${fieldClass} ${className}`.trim()}
        />
        {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  },
);
