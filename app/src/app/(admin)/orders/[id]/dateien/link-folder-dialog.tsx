"use client";

import { useState, useTransition } from "react";
import { FolderPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { linkOrderFolder } from "./actions";

type Props = { orderNo: number };

export function LinkFolderDialog({ orderNo }: Props) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [pen, start] = useTransition();
  const [form, setForm] = useState({
    displayName: "",
    absolutePath: "",
    nextcloudShareUrl: "",
    folderType: "customer_folder" as "raw_material" | "customer_folder",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    start(async () => {
      const r = await linkOrderFolder({
        orderNo,
        displayName: form.displayName.trim(),
        absolutePath: form.absolutePath.trim(),
        nextcloudShareUrl: form.nextcloudShareUrl.trim(),
        folderType: form.folderType,
        rootKind: form.folderType === "raw_material" ? "raw" : "customer",
      });
      if (r && "ok" in r && r.ok) {
        setOpen(false);
        setForm({ displayName: "", absolutePath: "", nextcloudShareUrl: "", folderType: "customer_folder" });
      } else if (r && "ok" in r && !r.ok) {
        setErr(r.error || "Ungültige Eingabe");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#B68E20]/40 bg-[#B68E20]/10 px-3 py-1.5 text-xs font-medium text-[#B68E20] transition-colors hover:bg-[#B68E20]/20"
      >
        <FolderPlus className="h-3.5 w-3.5" />
        Ordner verknüpfen
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogClose onClose={() => setOpen(false)} />
          <DialogHeader>
            <DialogTitle>Ordner verknüpfen</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {err && <p className="text-sm text-rose-400">{err}</p>}
            <div>
              <label className="mb-1 block text-xs text-white/60">Anzeigename *</label>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
                maxLength={200}
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Ordner-Typ *</label>
              <select
                value={form.folderType}
                onChange={(e) => setForm({ ...form, folderType: e.target.value as typeof form.folderType })}
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
              >
                <option value="customer_folder">Kundenmaterial</option>
                <option value="raw_material">Rohmaterial</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Nextcloud-Share-URL</label>
              <input
                value={form.nextcloudShareUrl}
                onChange={(e) => setForm({ ...form, nextcloudShareUrl: e.target.value })}
                placeholder="https://cloud.propus.ch/s/…"
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Absoluter Pfad (optional)</label>
              <input
                value={form.absolutePath}
                onChange={(e) => setForm({ ...form, absolutePath: e.target.value })}
                maxLength={2000}
                placeholder="/mnt/propus-nas-customers/2026/…"
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pen}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={pen || !form.displayName.trim()}
                className="rounded-md bg-[#B68E20] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#C9A23A] disabled:opacity-50"
              >
                {pen ? "Speichert…" : "Speichern"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
