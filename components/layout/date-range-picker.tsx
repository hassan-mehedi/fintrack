"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  startOfYear,
  endOfYear,
  subDays,
} from "date-fns";
import type { DateRange } from "react-day-picker";

const PRESETS = [
  { label: "This Month", getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: "Last Month", getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: "Last 30 Days", getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: "Last 90 Days", getValue: () => ({ from: subDays(new Date(), 90), to: new Date() }) },
  { label: "This Year", getValue: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
];

export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const currentFrom = fromParam ? new Date(fromParam) : startOfMonth(new Date());
  const currentTo = toParam ? new Date(toParam) : endOfMonth(new Date());

  const [range, setRange] = useState<DateRange | undefined>({
    from: currentFrom,
    to: currentTo,
  });
  const [open, setOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(currentFrom);

  const applyRange = (from: Date, to: Date) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", format(from, "yyyy-MM-dd"));
    params.set("to", format(to, "yyyy-MM-dd"));
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  };

  const goToPrevMonth = () => {
    const prevFrom = startOfMonth(subMonths(currentFrom, 1));
    const prevTo = endOfMonth(subMonths(currentFrom, 1));
    setRange({ from: prevFrom, to: prevTo });
    setCalMonth(prevFrom);
    applyRange(prevFrom, prevTo);
  };

  const goToNextMonth = () => {
    const nextFrom = startOfMonth(addMonths(currentFrom, 1));
    const nextTo = endOfMonth(addMonths(currentFrom, 1));
    setRange({ from: nextFrom, to: nextTo });
    setCalMonth(nextFrom);
    applyRange(nextFrom, nextTo);
  };

  const handlePreset = (preset: typeof PRESETS[number]) => {
    const { from, to } = preset.getValue();
    setRange({ from, to });
    setCalMonth(from);
    applyRange(from, to);
  };

  const handleApply = () => {
    if (range?.from && range?.to) {
      applyRange(range.from, range.to);
    }
  };

  const displayLabel = (() => {
    if (!fromParam && !toParam) return format(new Date(), "MMMM yyyy");
    const from = currentFrom;
    const to = currentTo;
    const sameMonth =
      from.getMonth() === to.getMonth() &&
      from.getFullYear() === to.getFullYear();
    if (
      sameMonth &&
      from.getDate() === 1 &&
      to.getDate() === endOfMonth(from).getDate()
    ) {
      return format(from, "MMMM yyyy");
    }
    return `${format(from, "MMM d")} - ${format(to, "MMM d, yyyy")}`;
  })();

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrevMonth}>
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="min-w-[160px] justify-start font-normal" />}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayLabel}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            {/* Presets sidebar */}
            <div className="border-r p-2 space-y-1">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handlePreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            {/* Calendar */}
            <div className="p-2">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                month={calMonth}
                onMonthChange={setCalMonth}
                numberOfMonths={2}
              />
              <div className="flex justify-end gap-2 border-t p-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={!range?.from || !range?.to}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNextMonth}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
