import * as React from "react";

export type ButtonVariant = "primary" | "brand" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-black text-white hover:bg-gray-800 focus-visible:ring-black",
  // Brand palette (defined in apps/web/tailwind.config.js). Used on the booking flow.
  brand: "bg-brand-green text-white hover:bg-brand-green-dark focus-visible:ring-brand-gold",
  secondary: "bg-white text-black ring-1 ring-gray-300 hover:bg-gray-100 focus-visible:ring-gray-400",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
  ghost: "bg-transparent text-black hover:bg-gray-100 focus-visible:ring-gray-400",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`.trim()}
    />
  );
}
