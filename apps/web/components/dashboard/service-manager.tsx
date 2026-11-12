"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { Alert, Badge, Button, Input, Modal, Textarea } from "@booking/ui";
import { tableBodyClass, tableCardClass, tableClass, tableHeadClass, tableRowClass, tableScrollClass } from "@/components/table-styles";
import { centsToDollarsInput, dollarsToCents } from "@/lib/dashboard";
import { formatDurationMin, formatPrice } from "@/lib/format";

export type ManagedService = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  bufferMin: number;
  isActive: boolean;
};

type FormValues = {
  name: string;
  description: string;
  durationMin: string;
  price: string;
  bufferMin: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY_FORM: FormValues = { name: "", description: "", durationMin: "30", price: "0.00", bufferMin: "0" };

// Maps the server's zod field names onto form field names.
const SERVER_FIELD: Record<string, keyof FormValues> = {
  name: "name",
  description: "description",
  durationMin: "durationMin",
  priceCents: "price",
  bufferMin: "bufferMin",
};

function toFormValues(s: ManagedService): FormValues {
  return {
    name: s.name,
    description: s.description ?? "",
    durationMin: String(s.durationMin),
    price: centsToDollarsInput(s.priceCents),
    bufferMin: String(s.bufferMin),
  };
}

// Validates the form locally and builds the API payload. Returns field errors when invalid.
function buildPayload(values: FormValues): { payload: Record<string, unknown> } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  const duration = Number(values.durationMin);
  const buffer = Number(values.bufferMin);
  const priceCents = dollarsToCents(values.price);

  if (!name) errors.name = "Enter a name";
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) errors.durationMin = "Between 5 and 480 minutes";
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 120) errors.bufferMin = "Between 0 and 120 minutes";
  if (priceCents === null) errors.price = "Enter a price such as 25 or 25.50";

  if (Object.keys(errors).length > 0) return { errors };
  return {
    payload: {
      name,
      description: values.description.trim() || null,
      durationMin: duration,
      priceCents,
      bufferMin: buffer,
    },
  };
}

// Services as a table, styled like the bookings tables. Editing happens in a modal; the table is read-only.
export function ServiceManager({ services }: { services: ManagedService[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ManagedService | "new" | null>(null);
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function openNew() {
    setEditing("new");
    setValues(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
  }

  function openEdit(service: ManagedService) {
    setEditing(service);
    setValues(toFormValues(service));
    setFieldErrors({});
    setFormError(null);
  }

  function close() {
    if (!pending) setEditing(null);
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function save() {
    if (!editing) return;
    const built = buildPayload(values);
    if ("errors" in built) {
      setFieldErrors(built.errors);
      return;
    }

    setPending(true);
    setFormError(null);
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/manage/services" : `/api/manage/services/${editing.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(built.payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          issues?: { fieldErrors?: Record<string, string[] | undefined> };
        } | null;
        const serverFieldErrors: FieldErrors = {};
        for (const [key, messages] of Object.entries(body?.issues?.fieldErrors ?? {})) {
          const field = SERVER_FIELD[key];
          if (field && messages?.[0]) serverFieldErrors[field] = messages[0];
        }
        setFieldErrors(serverFieldErrors);
        throw new Error(body?.error ?? "Could not save the service.");
      }
      setEditing(null);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the service.");
    } finally {
      setPending(false);
    }
  }

  async function toggleActive(service: ManagedService) {
    setListError(null);
    try {
      const res = await fetch(`/api/manage/services/${service.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !service.isActive }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not update the service.");
      }
      refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not update the service.");
    }
  }

  const isNew = editing === "new";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          Deactivated services are hidden from customers. Services with past bookings cannot be deleted.
        </p>
        <Button type="button" variant="brand" size="sm" onClick={openNew} className="gap-1.5">
          <Plus size={16} aria-hidden="true" />
          Add service
        </Button>
      </div>

      {listError && <Alert tone="error">{listError}</Alert>}

      <div className={tableCardClass}>
        <div className={tableScrollClass}>
          <table className={tableClass}>
            <caption className="sr-only">Services</caption>
            <thead className={tableHeadClass}>
              <tr>
                <th scope="col" className="px-4 py-3">Service</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3">Duration</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 text-right">Price</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className={tableBodyClass}>
              {services.map((s) => (
                <tr key={s.id} className={`${tableRowClass} ${s.isActive ? "" : "text-gray-400"}`}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className={s.isActive ? "font-medium text-brand-green" : "font-medium line-through"}>
                        {s.name}
                      </span>
                      {s.description && <span className="line-clamp-1 text-xs text-gray-500">{s.description}</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDurationMin(s.durationMin)}
                    {s.bufferMin > 0 && <span className="text-gray-500"> + {s.bufferMin} min buffer</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{formatPrice(s.priceCents)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => openEdit(s)}
                        aria-label={`Edit ${s.name}`}
                        className="gap-1.5"
                      >
                        <Pencil size={14} aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(s)}
                        className="gap-1.5"
                      >
                        {s.isActive ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                        {s.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {services.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-600">
                    No services yet. Add your first service so customers can book it.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={editing !== null}
        onClose={close}
        title={isNew ? "Add service" : "Edit service"}
        description="Prices are in USD. The buffer is blocked after each appointment."
        footer={
          <>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="brand" className="w-full sm:w-auto" onClick={save} disabled={pending}>
              {pending ? "Saving..." : isNew ? "Create service" : "Save changes"}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {formError && <Alert tone="error">{formError}</Alert>}
          <Input
            label="Name"
            value={values.name}
            maxLength={100}
            error={fieldErrors.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
          <Textarea
            label="Description (optional)"
            rows={2}
            maxLength={500}
            value={values.description}
            error={fieldErrors.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Duration (min)"
              type="number"
              inputMode="numeric"
              min={5}
              max={480}
              value={values.durationMin}
              error={fieldErrors.durationMin}
              onChange={(e) => setValues((v) => ({ ...v, durationMin: e.target.value }))}
            />
            <Input
              label="Price (USD)"
              inputMode="decimal"
              value={values.price}
              error={fieldErrors.price}
              onChange={(e) => setValues((v) => ({ ...v, price: e.target.value }))}
            />
            <Input
              label="Buffer (min)"
              type="number"
              inputMode="numeric"
              min={0}
              max={120}
              value={values.bufferMin}
              error={fieldErrors.bufferMin}
              onChange={(e) => setValues((v) => ({ ...v, bufferMin: e.target.value }))}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
