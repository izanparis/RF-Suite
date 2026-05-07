import React from "react";
import type { UnitOption } from "../lib/units";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Props = {
  label: string;
  value: string;
  unit: string;
  units: UnitOption[];
  onChangeValue: (v: string) => void;
  onChangeUnit: (u: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
};

export function UnitInput({
  label,
  value,
  unit,
  units,
  onChangeValue,
  onChangeUnit,
  placeholder,
  hint,
  disabled
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
      </div>

      <div className="grid grid-cols-12 gap-2 items-center">
        <Input
          className="col-span-7"
          value={value}
          onChange={(e) => onChangeValue(e.target.value)}
          placeholder={placeholder}
          inputMode="decimal"
          disabled={disabled}
        />
        <Select value={unit} onValueChange={onChangeUnit} disabled={disabled}>
          <SelectTrigger className="col-span-5">
            <SelectValue placeholder="Unidad" />
          </SelectTrigger>
          <SelectContent>
            {units.map((u) => (
              <SelectItem key={u.label} value={u.label}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
