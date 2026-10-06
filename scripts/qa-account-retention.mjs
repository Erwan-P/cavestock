import assert from "node:assert/strict";
import { addCalendarMonths, addDays } from "../src/lib/inactivity-dates.ts";

assert.equal(addCalendarMonths(new Date("2026-03-31T09:00:00.000Z"), -2).toISOString(), "2026-01-31T09:00:00.000Z");
assert.equal(addCalendarMonths(new Date("2025-08-31T12:30:00.000Z"), 6).toISOString(), "2026-02-28T12:30:00.000Z");
assert.equal(addCalendarMonths(new Date("2024-08-31T12:30:00.000Z"), 6).toISOString(), "2025-02-28T12:30:00.000Z");
assert.equal(addCalendarMonths(new Date("2026-10-06T09:00:00.000Z"), -12).toISOString(), "2025-10-06T09:00:00.000Z");
assert.equal(addDays(new Date("2026-10-06T09:00:00.000Z"), 7).toISOString(), "2026-10-13T09:00:00.000Z");

console.log("Conservation QA : deux mois, un an, six mois calendaires et rappel à sept jours OK.");
