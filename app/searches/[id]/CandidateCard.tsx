"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon } from "@/app/icons";
import { BrandUrlEditor } from "./BrandUrlEditor";
import { CandidateStatusControls } from "./CandidateStatusControls";
import { DeleteCandidateButton } from "./DeleteCandidateButton";
import { FitLogForm } from "./FitLogForm";
import { LocalTime } from "./LocalTime";
import { PriceSparkline } from "./PriceSparkline";
import { RestoreButton } from "./RestoreButton";
import { TargetPriceEditor } from "./TargetPriceEditor";
import { TrackedUrlsEditor } from "./TrackedUrlsEditor";
import {
  PRICE_SIGNAL_LABELS,
  PRICE_SIGNAL_STYLES,
  PRICE_SIGNAL_TEXT_STYLES,
  buildReviewSearchUrl,
  computePriceStats,
  formatPrice,
  humanizeAge,
  needsVerificationLabel,
  specsLine,
} from "./format";
import type { CandidateRow, PriceSnapshotRow } from "./types";

export function CandidateCard({
  searchId,
  candidate,
  priceHistory,
  reviewDomains,
}: {
  searchId: string;
  candidate: CandidateRow;
  priceHistory: PriceSnapshotRow[];
  reviewDomains: string[];
}) {
  const router = useRouter();
  const [refreshingPrice, setRefreshingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  if (candidate.status === "rejected") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
        <span className="truncate text-sm font-medium text-zinc-500 line-through dark:text-zinc-500">
          {candidate.brand} {candidate.name}
        </span>
        <FitDots rating={candidate.fit_rating} compact />
        {candidate.rejection_reason && (
          <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            {candidate.rejection_reason}
          </span>
        )}
        <RestoreButton searchId={searchId} candidateId={candidate.id} />
        <DeleteCandidateButton
          searchId={searchId}
          candidateId={candidate.id}
          label={`${candidate.brand} ${candidate.name}`}
        />
      </div>
    );
  }

  const specs = specsLine(candidate.size, candidate.weight_grams);
  // priceHistory is already ordered newest-first (matches the page's
  // query), so [0] is the latest snapshot for this candidate, if any.
  const latestSnapshot = priceHistory[0] ?? null;
  // ?? not just the type's `| null`: guards against target_price being
  // undefined at runtime if migration 006 hasn't been applied yet —
  // select("*") silently omits a column that doesn't exist rather than
  // erroring, so this can be undefined even though the type says null.
  const targetPrice = candidate.target_price ?? null;
  const priceStats = computePriceStats(priceHistory, targetPrice);
  // ?? [] for the same reason as targetPrice above: undefined at
  // runtime, not just absent, if migration 005 hasn't been applied yet.
  const trackedUrls = candidate.tracked_urls ?? [];

  async function refreshPrice() {
    setPriceError(null);
    setRefreshingPrice(true);
    try {
      const res = await fetch("/api/track-prices", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id }),
      });
      // Not JSON-parsed either way, but a non-ok response (e.g. a
      // plain-text 401 from the Basic Auth proxy) still shouldn't be
      // treated as success.
      if (!res.ok) throw new Error(`Price refresh failed: ${res.status} ${res.statusText}`);
      router.refresh();
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingPrice(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {candidate.brand} {candidate.name}
          </h3>
          {specs && (
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{specs}</p>
          )}
          <div className="mt-1">
            <BrandUrlEditor
              searchId={searchId}
              candidateId={candidate.id}
              brandUrl={candidate.brand_url}
            />
          </div>
        </div>
        <CandidateStatusControls
          searchId={searchId}
          candidateId={candidate.id}
          status={candidate.status}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <FitDots rating={candidate.fit_rating} />
          {(candidate.fit_notes || candidate.tried_on_at) && (
            <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
              {candidate.fit_notes}
              {candidate.fit_notes && candidate.tried_on_at && " · "}
              {candidate.tried_on_at && (
                <>
                  Tried on <LocalTime iso={candidate.tried_on_at} dateOnly />
                </>
              )}
            </p>
          )}
          <FitLogForm
            searchId={searchId}
            candidateId={candidate.id}
            initialRating={candidate.fit_rating}
            initialNotes={candidate.fit_notes}
          />
        </div>

        <div className="text-right">
          {candidate.current_price !== null && (
            <>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {formatPrice(candidate.current_price, candidate.current_price_currency)}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {candidate.current_price_retailer}
                {candidate.price_updated_at && ` · ${humanizeAge(candidate.price_updated_at)}`}
              </div>
            </>
          )}
          {trackedUrls.length > 0 && (
            <RefreshButton
              label="Refresh price"
              loading={refreshingPrice}
              onClick={refreshPrice}
              className="mt-1.5"
            />
          )}
          {priceError && (
            <p className="mt-1.5 max-w-[12rem] text-xs text-red-600 dark:text-red-400">
              {priceError}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <TrackedUrlsEditor
          searchId={searchId}
          candidateId={candidate.id}
          trackedUrls={trackedUrls}
        />
      </div>

      {latestSnapshot && latestSnapshot.domains_failed.length > 0 && (
        <p className="mt-3">
          <span
            title={latestSnapshot.domains_failed.join(", ")}
            className="inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
          >
            {latestSnapshot.domains_failed.length} site
            {latestSnapshot.domains_failed.length === 1 ? "" : "s"} not checked in last price run
          </span>
        </p>
      )}

      {priceStats && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${PRICE_SIGNAL_STYLES[priceStats.signal]}`}
          >
            {PRICE_SIGNAL_LABELS[priceStats.signal]}
          </span>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Lowest {formatPrice(priceStats.lowest, priceStats.currency)}</span>
            <span>Avg {formatPrice(priceStats.average, priceStats.currency)}</span>
            <span>
              {priceStats.vsLowestPct === 0
                ? "At lowest"
                : `+${priceStats.vsLowestPct.toFixed(0)}% vs lowest`}
            </span>
          </div>
          <div className={PRICE_SIGNAL_TEXT_STYLES[priceStats.signal]}>
            <PriceSparkline prices={priceStats.history} />
          </div>
          <div className="ml-auto">
            <TargetPriceEditor
              searchId={searchId}
              candidateId={candidate.id}
              targetPrice={targetPrice}
              currency={priceStats.currency}
            />
          </div>
        </div>
      )}

      {reviewDomains.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Find reviews</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {reviewDomains.map((domain) => (
              <a
                key={domain}
                href={buildReviewSearchUrl(domain, candidate.brand, candidate.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                {domain}
                <ExternalLinkIcon />
              </a>
            ))}
          </div>
        </div>
      )}

      {candidate.needs_verification.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {candidate.needs_verification.map((nv, i) => (
            <span
              key={i}
              title={nv.note}
              className="cursor-help rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
            >
              {needsVerificationLabel(nv.field)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <DeleteCandidateButton
          searchId={searchId}
          candidateId={candidate.id}
          label={`${candidate.brand} ${candidate.name}`}
        />
      </div>
    </div>
  );
}

function RefreshButton({
  label,
  loading,
  onClick,
  className = "",
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 ${className}`}
    >
      {loading ? <Spinner /> : <RefreshIcon />}
      {label}
    </button>
  );
}

function RefreshIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3 w-3"
    >
      <path
        fillRule="evenodd"
        d="M15.312 5.312a5 5 0 00-8.478 2.293.75.75 0 11-1.449-.39 6.5 6.5 0 0111.06-2.98l.708-.708a.5.5 0 01.854.353v3.03a.5.5 0 01-.5.5h-3.03a.5.5 0 01-.353-.854l.708-.708zM4.688 14.688a5 5 0 008.478-2.293.75.75 0 111.449.39 6.5 6.5 0 01-11.06 2.98l-.708.708a.5.5 0 01-.854-.353v-3.03a.5.5 0 01.5-.5h3.03a.5.5 0 01.353.854l-.708.708z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function FitDots({ rating, compact = false }: { rating: number | null; compact?: boolean }) {
  const dotSize = compact ? "h-1.5 w-1.5" : "h-2.5 w-2.5";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`${dotSize} rounded-full ${
              rating !== null && i < rating
                ? "bg-zinc-700 dark:bg-zinc-300"
                : "border border-zinc-300 dark:border-zinc-600"
            }`}
          />
        ))}
      </div>
      {rating === null && !compact && (
        <span className="text-xs text-zinc-400 dark:text-zinc-500">not tried yet</span>
      )}
    </div>
  );
}
