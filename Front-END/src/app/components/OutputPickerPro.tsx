import React, { useMemo, useState } from "react";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { isFsAccessSupported, pickDirectory, DirectoryHandle } from "../lib/fsAccess";

type Props = {
  label?: string;
  defaultName?: string;
  onChange?: (v: { filename: string; dirHandle: DirectoryHandle | null }) => void;
};

export function OutputPickerPro({
  label = "Archivo de salida",
  defaultName = "",
  onChange,
}: Props) {
  const [filename, setFilename] = useState(defaultName);
  const [dirHandle, setDirHandle] = useState<DirectoryHandle | null>(null);
  const [dirLabel, setDirLabel] = useState<string>("(no seleccionada)");
  const supported = useMemo(() => isFsAccessSupported(), []);

  async function onPickFolder() {
    try {
      const h = await pickDirectory();
      setDirHandle(h);
      setDirLabel(h?.name ?? "(carpeta)");
      onChange?.({ filename, dirHandle: h });
    } catch {
      // cancelado
    }
  }

  function onClearFolder() {
    setDirHandle(null);
    setDirLabel("(no seleccionada)");
    onChange?.({ filename, dirHandle: null });
  }

  function onFilename(v: string) {
    setFilename(v);
    onChange?.({ filename: v, dirHandle });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {supported ? `Carpeta: ${dirLabel}` : "(usa Chrome/Edge para elegir carpeta)"}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-2 items-center">
        <Input
          className="col-span-12 md:col-span-6"
          value={filename}
          onChange={(e) => onFilename(e.target.value)}
          placeholder={defaultName}
        />

        <Button
          className="col-span-12 md:col-span-4"
          variant="secondary"
          onClick={onPickFolder}
          disabled={!supported}
          type="button"
        >
          Elegir carpeta…
        </Button>

        <Button
          className="col-span-12 md:col-span-2"
          variant="outline"
          onClick={onClearFolder}
          disabled={!dirHandle}
          type="button"
        >
          Limpiar
        </Button>
      </div>
    </div>
  );
}
