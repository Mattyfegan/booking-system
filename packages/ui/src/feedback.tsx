import * as React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-gray-200 ${className}`.trim()} />;
}

export type AlertTone = "error" | "success" | "info";

const alertTones: Record<AlertTone, string> = {
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-green-200 bg-green-50 text-green-800",
  info: "border-gray-200 bg-gray-50 text-gray-800",
};

export function Alert({
  tone = "info",
  children,
  className = "",
}: {
  tone?: AlertTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-sm ${alertTones[tone]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`.trim()}>{children}</div>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 p-8 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-gray-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
