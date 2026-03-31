import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2,
  Link2Off,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Plug,
  Info,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { t, type Lang } from "../i18n";
import { formatSwissDateTime } from "../lib/format";
import {
  loadExxasConfig,
  loadExxasConfigMerged,
  saveExxasConfigMerged,
  testExxasConnection,
  EXXAS_ALL_FIELDS,
  type ExxasMappingConfig,
} from "../api/exxas";

export function ExxasSettingsPage() {
  const lang = useAuthStore((s) => s.language) as Lang;
  const token = useAuthStore((s) => s.token);

  const [config, setConfig] = useState<ExxasMappingConfig>(() => loadExxasConfig());
  const [configReady, setConfigReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const merged = await loadExxasConfigMerged(token);
        if (!cancelled) setConfig(merged);
      } finally {
        if (!cancelled) setConfigReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleFieldChange = useCallback(
    (field: "apiKey" | "appPassword" | "endpoint", value: string) => {
      setConfig((c) => ({ ...c, [field]: value }));
      setDirty(true);
      setTestStatus("idle");
    },
    []
  );

  const handleToggleEnabled = useCallback(() => {
    setConfig((c) => ({ ...c, enabled: !c.enabled }));
    setDirty(true);
  }, []);

  const handleTestConnection = useCallback(async () => {
    if (!config.apiKey) return;
    setTestStatus("testing");
    setTestMessage("");
    const result = await testExxasConnection(
      config.apiKey,
      config.appPassword,
      config.endpoint,
      config.authMode
    );
    setTestStatus(result.ok ? "ok" : "error");
    setTestMessage(result.message);
  }, [config.apiKey, config.appPassword, config.endpoint, config.authMode]);

  const handleSave = useCallback(async () => {
    setSaveError("");
    const toSave: ExxasMappingConfig = {
      ...config,
      lastSyncAt: new Date().toISOString(),
    };
    try {
      await saveExxasConfigMerged(toSave, token);
      setConfig(toSave);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }, [config, token]);

  const handleReset = useCallback(async () => {
    setSaveError("");
    const next = await loadExxasConfigMerged(token);
    setConfig(next);
    setDirty(false);
    setTestStatus("idle");
    setTestMessage("");
  }, [token]);

  if (!configReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-[var(--text-subtle)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        <p className="text-sm">{t(lang, "settings.exxas.loadingSettings")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[var(--accent)]/10 rounded-xl">
            <Plug className="h-6 w-6 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)]">
              {t(lang, "exxas.title")}
            </h1>
            <p className="text-sm text-[var(--text-subtle)] mt-0.5">
              {t(lang, "exxas.subtitle")}
            </p>
          </div>
        </div>

        {/* Save / Reset Buttons */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                {t(lang, "exxas.button.reset")}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                dirty
                  ? "bg-[var(--accent)] hover:bg-[#b8954e] text-white shadow-sm"
                  : saved
                    ? "bg-green-500 text-white"
                    : "bg-[var(--surface-raised)] text-[var(--text-subtle)] cursor-not-allowed"
              }`}
            >
              {saved ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {t(lang, "exxas.button.saved")}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t(lang, "exxas.button.save")}
                </>
              )}
            </button>
          </div>
          {saveError ? <p className="text-sm text-red-600 dark:text-red-400 text-right max-w-md">{saveError}</p> : null}
        </div>
      </div>

      {/* Connection Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[var(--surface)] rounded-2xl border border-[var(--border-soft)] shadow-sm overflow-hidden"
      >
        {/* Card Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 border-[var(--border-soft)]">
          <div className="flex items-center gap-2.5">
            {config.enabled ? (
              <Link2 className="h-5 w-5 text-[var(--accent)]" />
            ) : (
              <Link2Off className="h-5 w-5 text-[var(--text-subtle)]" />
            )}
            <h2 className="text-base font-semibold text-[var(--text-main)]">
              {t(lang, "exxas.connection.title")}
            </h2>
          </div>
          {/* Enable Toggle */}
          <button
            type="button"
            onClick={handleToggleEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              config.enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-raised)]"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                config.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Info Banner */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--surface-raised)]/50 border border-[var(--border-soft)]">
            <Info className="h-4 w-4 text-[var(--text-subtle)] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
              {t(lang, "exxas.connection.info")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                {t(lang, "exxas.connection.apiKey")}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={config.apiKey}
                  onChange={(e) => handleFieldChange("apiKey", e.target.value)}
                  placeholder={t(lang, "exxas.connection.apiKeyPlaceholder")}
                  className="w-full pr-10 pl-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-sm text-[var(--text-main)] placeholder:text-slate-400 placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text-muted)] transition-colors"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                {t(lang, "exxas.connection.apiKeyHint")}
              </p>
            </div>

            {/* App Password */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                {t(lang, "exxas.connection.appPassword")}
              </label>
              <div className="relative">
                <input
                  type={showAppPassword ? "text" : "password"}
                  value={config.appPassword}
                  onChange={(e) => handleFieldChange("appPassword", e.target.value)}
                  placeholder={t(lang, "exxas.connection.appPasswordPlaceholder")}
                  className="w-full pr-10 pl-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-sm text-[var(--text-main)] placeholder:text-slate-400 placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowAppPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text-muted)] transition-colors"
                >
                  {showAppPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                {t(lang, "exxas.connection.appPasswordHint")}
              </p>
            </div>

            {/* Endpoint */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                {t(lang, "exxas.connection.endpoint")}
              </label>
              <input
                type="url"
                value={config.endpoint}
                onChange={(e) => handleFieldChange("endpoint", e.target.value)}
                placeholder={t(lang, "exxas.connection.endpointPlaceholder")}
                className="w-full pl-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-sm text-[var(--text-main)] placeholder:text-slate-400 placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] transition-colors"
              />
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                {t(lang, "exxas.connection.endpointHint")}
              </p>
            </div>

            {/* Auth Mode */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                {t(lang, "exxas.connection.authMode")}
              </label>
              <select
                value={config.authMode}
                onChange={(e) => {
                  setConfig((c) => ({ ...c, authMode: e.target.value as "apiKey" | "bearer" }));
                  setDirty(true);
                  setTestStatus("idle");
                }}
                className="w-full pl-3 py-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] transition-colors"
              >
                <option value="apiKey">{t(lang, "exxas.connection.authMode.apiKey")}</option>
                <option value="bearer">{t(lang, "exxas.connection.authMode.bearer")}</option>
              </select>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                {t(lang, "exxas.connection.authModeHint")}
              </p>
            </div>
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={!config.apiKey || testStatus === "testing"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-slate-50 hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testStatus === "testing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              {t(lang, "exxas.connection.test")}
            </button>

            <AnimatePresence>
              {testStatus !== "idle" && testStatus !== "testing" && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-center gap-1.5 text-sm ${
                    testStatus === "ok"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {testStatus === "ok" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <span>
                    {testMessage ||
                      t(lang, testStatus === "ok" ? "exxas.connection.testOk" : "exxas.connection.testFail")}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Last sync info */}
          {config.lastSyncAt && (
            <p className="text-xs text-[var(--text-subtle)]">
              {t(lang, "exxas.connection.lastSaved")}: {formatSwissDateTime(config.lastSyncAt)}
            </p>
          )}
        </div>
      </motion.div>

      {/* EXXAS API field names (reference table) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-[var(--surface)] rounded-2xl border border-[var(--border-soft)] shadow-sm overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 border-[var(--border-soft)]">
          <h2 className="text-base font-semibold text-[var(--text-main)]">
            {t(lang, "exxas.reference.title")}
          </h2>
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">
            {t(lang, "exxas.reference.subtitle")}
          </p>
        </div>

        <div className="overflow-x-auto">
          <div className="max-h-[min(70vh,32rem)] overflow-y-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-[var(--surface-raised)]/95 backdrop-blur-sm border-b border-[var(--border-soft)]">
                <tr>
                  <th className="text-left font-semibold text-[var(--text-muted)] px-4 py-3 whitespace-nowrap">
                    {t(lang, "exxas.reference.col.category")}
                  </th>
                  <th className="text-left font-semibold text-[var(--text-muted)] px-4 py-3 whitespace-nowrap">
                    {t(lang, "exxas.reference.col.apiField")}
                  </th>
                  <th className="text-left font-semibold text-[var(--text-muted)] px-4 py-3">
                    {t(lang, "exxas.reference.col.description")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {EXXAS_ALL_FIELDS.map((row, index) => (
                  <tr
                    key={`${row.category}-${row.key}-${index}`}
                    className="hover:bg-slate-50/80 hover:bg-[var(--surface-raised)]/40"
                  >
                    <td className="px-4 py-2.5 text-[var(--text-muted)] whitespace-nowrap align-top">
                      {t(lang, `exxas.category.${row.category}`)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-main)] align-top whitespace-nowrap">
                      {row.key}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-subtle)] text-xs leading-relaxed align-top">
                      {row.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
}



