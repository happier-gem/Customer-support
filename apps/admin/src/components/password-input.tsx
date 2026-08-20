"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { inputClass } from "@/lib/ui";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">;

export function PasswordInput({ id, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      <input
        id={inputId}
        type={visible ? "text" : "password"}
        className={`${inputClass} pr-10`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-foreground/60 hover:text-foreground"
      >
        {visible ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.58 10.58a2 2 0 002.83 2.83M9.36 5.6A9.77 9.77 0 0112 5.25c4.64 0 8.57 3.01 10 7.25a11.06 11.06 0 01-3.02 4.42M6.6 6.6C4.4 8.02 2.76 10.13 2 12.5c1.43 4.24 5.36 7.25 10 7.25 1.35 0 2.64-.26 3.83-.73"
            />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 12.5C3.43 8.26 7.36 5.25 12 5.25s8.57 3.01 10 7.25c-1.43 4.24-5.36 7.25-10 7.25S3.43 16.74 2 12.5z" />
            <circle cx="12" cy="12.5" r="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
