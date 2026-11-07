import React, { useState, useEffect, useRef } from "react";
import {
  type ExhibitionOption,
  searchExhibitionCatalog,
  type ExhibitionSearchSuggestion,
} from "@/lib/api/exhibitions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown } from "lucide-react";

interface ExhibitionSelectorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ExhibitionOption[];
  error?: string;
  disabled?: boolean;
  label?: string;
  required?: boolean;
}

export default function ExhibitionSelector({
  id = "metAtLocation",
  value,
  onChange,
  options,
  error,
  disabled = false,
  label = "Exhibition / Source",
  required = true,
}: ExhibitionSelectorProps) {
  // Check if current value matches one of the preset dropdown options (excluding "Other / Source")
  const isPreset = options.some(
    (opt) => opt.value && opt.value !== "Other / Source" && opt.value === value
  );

  // If value is set to something not in preset (or "Other / Source"), we show the custom predictive input
  const isOther = (!isPreset && Boolean(value)) || value === "Other / Source";

  const [selectChoice, setSelectChoice] = useState<string>(() => {
    if (isPreset) return value;
    if (isOther) return "Other / Source";
    return "";
  });

  const [customText, setCustomText] = useState<string>(() => {
    if (isOther && value !== "Other / Source") return value;
    return "";
  });

  const [suggestions, setSuggestions] = useState<ExhibitionSearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchronize internal state if outer value changes (e.g. reset or OCR data loaded)
  useEffect(() => {
    if (isPreset) {
      setSelectChoice(value);
      setCustomText("");
    } else if (value) {
      setSelectChoice("Other / Source");
      if (value !== "Other / Source") {
        setCustomText(value);
      }
    } else {
      setSelectChoice('');
      setCustomText('');
    }
  }, [value, isPreset]);

  // Handle dropdown selection change
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setSelectChoice(next);
    setShowSuggestions(false);

    if (next === "Other / Source") {
      // If we already have custom text, keep it; otherwise set "Other / Source" until typed
      onChange(customText.trim() || "Other / Source");
    } else {
      setCustomText("");
      onChange(next);
    }
  };

  // Handle typing in the custom "Other / Source" predictive text input
  const handleCustomTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setCustomText(text);
    onChange(text);

    if (text.trim().length >= 1) {
      const matches = searchExhibitionCatalog(text, 6);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Select an auto-suggested event
  const handleSelectSuggestion = (s: ExhibitionSearchSuggestion) => {
    setCustomText(s.name);
    onChange(s.name);
    setShowSuggestions(false);
  };

  // Click outside to dismiss suggestions dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, []);

  return (
    <div ref={containerRef} className="space-y-1.5 w-full">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
          {label} {required && <span className="text-red-600" aria-hidden="true">*</span>}
        </Label>
      </div>

      {/* Main Select Dropdown: shows recent & upcoming tradeshows in ~2 month window */}
      <div className="relative">
        <select
          id={id}
          value={selectChoice}
          onChange={handleSelectChange}
          disabled={disabled}
          aria-required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`h-11 w-full appearance-none rounded-xl border bg-white px-3.5 pr-10 text-base sm:text-sm text-slate-900 shadow-2xs transition-colors focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800 ${
            error
              ? "border-red-500 bg-red-50/20 dark:border-red-600/60"
              : "border-slate-200 dark:border-slate-800"
          }`}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={!opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>

      {/* Predictive text input for "Other / Source" */}
      {selectChoice === "Other / Source" && (
        <div className="relative mt-2 space-y-1 animate-in fade-in-50 duration-200">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <Input
              type="text"
              id={`${id}-custom`}
              value={customText}
              onChange={handleCustomTextChange}
              onFocus={() => {
                if (customText.trim().length >= 1) {
                  const matches = searchExhibitionCatalog(customText, 6);
                  setSuggestions(matches);
                  setShowSuggestions(matches.length > 0);
                }
              }}
              placeholder="Enter exhibition or lead source"
              autoComplete="off"
              className="h-11 pl-9 pr-3 text-base sm:text-sm rounded-xl border-blue-300 dark:border-blue-700 focus:border-blue-600 dark:bg-slate-900"
            />
          </div>

          {/* Autocomplete / Predictive Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900 text-xs sm:text-sm divide-y divide-slate-100 dark:divide-slate-800"
            >
              {suggestions.map((s) => (
                <li
                  key={s.name}
                  role="option"
                  aria-selected={customText.trim() === s.name}
                  onClick={() => handleSelectSuggestion(s)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-blue-50 active:bg-blue-100 dark:hover:bg-slate-800 dark:active:bg-slate-700 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {s.name}
                    </div>
                    {s.location && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {s.location}
                      </div>
                    )}
                  </div>
                  {s.dates && (
                    <span className="shrink-0 text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md tabular-nums">
                      {s.dates}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400 font-medium mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
