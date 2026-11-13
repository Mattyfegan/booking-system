"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Modal } from "@booking/ui";
import {
  tableBodyClass,
  tableCardClass,
  tableClass,
  tableHeadClass,
  tableRowClass,
  tableScrollClass,
} from "@/components/table-styles";
import { formatDayInZone } from "@/lib/format";

export type ManagedRule = {
  id: string;
  dayOfWeek: number; // 0 = Sunday ... 6 = Saturday
  startTime: string; // HH:mm in the business timezone
  endTime: string;
};

export type ManagedOverride = {
  id: string;
  date: string; // YYYY-MM-DD
  isClosed: boolean;
  startTime: string | null;
  endTime: string | null;
  bookingCount: number; // confirmed bookings on that date
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Display order runs Monday to Sunday.
const dayOrder = (dayOfWeek: number) => (dayOfWeek + 6) % 7;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const selectClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black disabled:bg-gray-100";
const labelClass = "text-sm font-medium text-gray-800";
const timeInputClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black disabled:bg-gray-100";

// Sends a JSON request to the manage API. Throws with the server's message so the UI can show it.
async function send(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.ok) return;
  const data = (await res.json().catch(() => null)) as {
    error?: string;
    issues?: { fieldErrors?: Record<string, string[] | undefined> };
  } | null;
  const fieldMessage = Object.values(data?.issues?.fieldErrors ?? {})
    .flatMap((m) => m ?? [])
    .find(Boolean);
  throw new Error(fieldMessage ?? data?.error ?? "Request failed. Please try again.");
}

type RuleForm = { dayOfWeek: string; startTime: string; endTime: string };
type OverrideMode = "closed" | "hours";

// Owner editor for weekly opening hours and per-date overrides (closed days or special hours).
// Changes go through /api/manage/availability/* and the page is refreshed from the server afterwards.
export function AvailabilityEditor({
  rules,
  overrides,
  today,
  timezone,
}: {
  rules: ManagedRule[];
  overrides: ManagedOverride[];
  today: string;
  timezone: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Weekly rule modal
  const [ruleEditing, setRuleEditing] = useState<ManagedRule | "new" | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm>({ dayOfWeek: "1", startTime: "09:00", endTime: "17:00" });
  const [ruleError, setRuleError] = useState<string | null>(null);

  // Override form (inline)
  const [ovDate, setOvDate] = useState("");
  const [ovMode, setOvMode] = useState<OverrideMode>("closed");
  const [ovStart, setOvStart] = useState("09:00");
  const [ovEnd, setOvEnd] = useState("13:00");
  const [ovError, setOvError] = useState<string | null>(null);
  const [ovNotice, setOvNotice] = useState<string | null>(null);

  const sortedRules = [...rules].sort(
    (a, b) => dayOrder(a.dayOfWeek) - dayOrder(b.dayOfWeek) || a.startTime.localeCompare(b.startTime),
  );

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function run(action: () => Promise<void>, onError: (message: string) => void) {
    setPending(true);
    try {
      await action();
      refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Request failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function openNewRule() {
    setRuleEditing("new");
    setRuleForm({ dayOfWeek: "1", startTime: "09:00", endTime: "17:00" });
    setRuleError(null);
  }

  function openEditRule(rule: ManagedRule) {
    setRuleEditing(rule);
    setRuleForm({ dayOfWeek: String(rule.dayOfWeek), startTime: rule.startTime, endTime: rule.endTime });
    setRuleError(null);
  }

  function closeRuleModal() {
    if (!pending) setRuleEditing(null);
  }

  async function saveRule() {
    if (!ruleEditing) return;
    if (!TIME_RE.test(ruleForm.startTime) || !TIME_RE.test(ruleForm.endTime)) {
      setRuleError("Enter both times.");
      return;
    }
    if (ruleForm.startTime >= ruleForm.endTime) {
      setRuleError("The end time must be after the start time.");
      return;
    }
    const payload = {
      dayOfWeek: Number(ruleForm.dayOfWeek),
      startTime: ruleForm.startTime,
      endTime: ruleForm.endTime,
    };
    const isNew = ruleEditing === "new";
    await run(
      () =>
        send(
          isNew ? "/api/manage/availability/rules" : `/api/manage/availability/rules/${ruleEditing.id}`,
          isNew ? "POST" : "PATCH",
          payload,
        ).then(() => setRuleEditing(null)),
      setRuleError,
    );
  }

  async function deleteRule(rule: ManagedRule) {
    setListError(null);
    await run(() => send(`/api/manage/availability/rules/${rule.id}`, "DELETE"), setListError);
  }

  async function saveOverride() {
    setOvError(null);
    setOvNotice(null);
    if (!ovDate) {
      setOvError("Choose a date.");
      return;
    }
    if (ovMode === "hours" && (!TIME_RE.test(ovStart) || !TIME_RE.test(ovEnd) || ovStart >= ovEnd)) {
      setOvError("Enter a start time before the end time.");
      return;
    }
    const isClosed = ovMode === "closed";
    const payload = {
      date: ovDate,
      isClosed,
      startTime: isClosed ? null : ovStart,
      endTime: isClosed ? null : ovEnd,
    };
    const existing = overrides.find((o) => o.date === ovDate);
    await run(async () => {
      await send("/api/manage/availability/overrides", "POST", payload);
      setOvDate("");
      const verb = existing ? "updated" : "saved";
      setOvNotice(
        isClosed
          ? `${payload.date} is blocked (${verb}). Customers cannot book that day.`
          : `${payload.date} now uses custom hours (${verb}).`,
      );
    }, setOvError);
  }

  async function deleteOverride(override: ManagedOverride) {
    setOvError(null);
    setOvNotice(null);
    await run(() => send(`/api/manage/availability/overrides/${override.id}`, "DELETE"), setOvError);
  }

  const isNewRule = ruleEditing === "new";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            Weekly opening hours in {timezone}. Customers can only book inside these windows.
          </p>
          <Button type="button" variant="brand" size="sm" onClick={openNewRule} className="gap-1.5">
            <Plus size={16} aria-hidden="true" />
            Add hours
          </Button>
        </div>

        {listError && <Alert tone="error">{listError}</Alert>}

        <div className={tableCardClass}>
          <div className={tableScrollClass}>
            <table className={tableClass}>
              <caption className="sr-only">Weekly opening hours</caption>
              <thead className={tableHeadClass}>
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Day
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Hours
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className={tableBodyClass}>
                {sortedRules.map((r) => (
                  <tr key={r.id} className={tableRowClass}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-brand-green">
                      {DAY_NAMES[r.dayOfWeek]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={14} aria-hidden="true" className="text-gray-500" />
                        {r.startTime} to {r.endTime}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={pending}
                          onClick={() => openEditRule(r)}
                          aria-label={`Edit ${DAY_NAMES[r.dayOfWeek]} ${r.startTime} to ${r.endTime}`}
                          className="gap-1.5"
                        >
                          <Pencil size={14} aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => deleteRule(r)}
                          aria-label={`Delete ${DAY_NAMES[r.dayOfWeek]} ${r.startTime} to ${r.endTime}`}
                          className="gap-1.5 text-red-700"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-gray-600">
                      No weekly hours set. Customers cannot book until you add some.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">
          Block a whole day (holiday, closure) or give one date different hours. Blocking a day does not cancel bookings
          already made for it; cancel those from the bookings list.
        </p>

        <form
          className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            saveOverride();
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="override-date" className={labelClass}>
              Date
            </label>
            <input
              id="override-date"
              type="date"
              min={today}
              value={ovDate}
              onChange={(e) => setOvDate(e.target.value)}
              className={timeInputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="override-mode" className={labelClass}>
              Override
            </label>
            <select
              id="override-mode"
              value={ovMode}
              onChange={(e) => setOvMode(e.target.value as OverrideMode)}
              className={selectClass}
            >
              <option value="closed">Block whole day</option>
              <option value="hours">Custom hours</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="override-start" className={labelClass}>
              Start
            </label>
            <input
              id="override-start"
              type="time"
              value={ovStart}
              disabled={ovMode === "closed"}
              onChange={(e) => setOvStart(e.target.value)}
              className={timeInputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="override-end" className={labelClass}>
              End
            </label>
            <input
              id="override-end"
              type="time"
              value={ovEnd}
              disabled={ovMode === "closed"}
              onChange={(e) => setOvEnd(e.target.value)}
              className={timeInputClass}
            />
          </div>
          <Button type="submit" variant="brand" disabled={pending} className="gap-1.5">
            <Plus size={16} aria-hidden="true" />
            {ovMode === "closed" ? "Block day" : "Save hours"}
          </Button>
        </form>

        {ovError && <Alert tone="error">{ovError}</Alert>}
        {ovNotice && <Alert tone="success">{ovNotice}</Alert>}

        <div className={tableCardClass}>
          <div className={tableScrollClass}>
            <table className={tableClass}>
              <caption className="sr-only">Upcoming date overrides</caption>
              <thead className={tableHeadClass}>
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Override
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Bookings
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className={tableBodyClass}>
                {overrides.map((o) => (
                  <tr key={o.id} className={tableRowClass}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-brand-green">
                      {formatDayInZone(new Date(`${o.date}T12:00:00Z`), "UTC")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {o.isClosed ? (
                        <Badge tone="danger">Closed</Badge>
                      ) : (
                        <span>
                          Custom hours {o.startTime} to {o.endTime}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {o.bookingCount === 0 ? (
                        <span className="text-gray-500">None</span>
                      ) : (
                        <Badge tone="warning">
                          {o.bookingCount} confirmed
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => deleteOverride(o)}
                          aria-label={`Remove override for ${o.date}`}
                          className="gap-1.5 text-red-700"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {overrides.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-600">
                      No upcoming overrides. The weekly hours apply to every date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        open={ruleEditing !== null}
        onClose={closeRuleModal}
        title={isNewRule ? "Add opening hours" : "Edit opening hours"}
        description={`Times are ${timezone}. Hours on the same day cannot overlap.`}
        footer={
          <>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={closeRuleModal} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="brand" className="w-full sm:w-auto" onClick={saveRule} disabled={pending}>
              {pending ? "Saving..." : isNewRule ? "Add hours" : "Save changes"}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            saveRule();
          }}
        >
          {ruleError && <Alert tone="error">{ruleError}</Alert>}
          <div className="flex flex-col gap-1">
            <label htmlFor="rule-day" className={labelClass}>
              Day
            </label>
            <select
              id="rule-day"
              value={ruleForm.dayOfWeek}
              onChange={(e) => setRuleForm((f) => ({ ...f, dayOfWeek: e.target.value }))}
              className={selectClass}
            >
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {DAY_NAMES[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="rule-start" className={labelClass}>
                Opens
              </label>
              <input
                id="rule-start"
                type="time"
                value={ruleForm.startTime}
                onChange={(e) => setRuleForm((f) => ({ ...f, startTime: e.target.value }))}
                className={timeInputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="rule-end" className={labelClass}>
                Closes
              </label>
              <input
                id="rule-end"
                type="time"
                value={ruleForm.endTime}
                onChange={(e) => setRuleForm((f) => ({ ...f, endTime: e.target.value }))}
                className={timeInputClass}
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
