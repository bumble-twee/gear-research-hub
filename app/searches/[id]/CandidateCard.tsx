"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateStatusControls } from "./CandidateStatusControls";
import { FitLogForm } from "./FitLogForm";
import { LocalTime } from "./LocalTime";
import { RestoreButton } from "./RestoreButton";
import { ReviewLinksExpander } from "./ReviewLinksExpander";
import { formatPrice, humanizeAge, needsVerificationLabel, specsLine } from "./format";
import type { CandidateRow, PriceSnapshotRow, ReviewSnapshotRow } from "./types";

export function CandidateCard({
  searchId,
  candidate,
  priceSnapshot,
  reviewSnapshot,
  retailerDomains,
  reviewDomains,
  focusCriteria,
}: {
  searchId: string;
  candidate: CandidateRow;
  priceSnapshot: PriceSnapshotRow | null;
  reviewSnapshot: ReviewSnapshotRow | null;
  retailerDomains: string[];
  reviewDomains: string[];
  focusCriteria: string[];
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState<"price" | "reviews" | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

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
      </div>
    );
  }

  const specs = specsLine(candidate.size, candidate.weight_grams);

  async function refreshPrice() {
    setPriceError(null);
    setRefreshing("price");
    try {
      const res = await fetch("/api/tools/find-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: candidate.brand,
          item_name: candidate.name,
          size: candidate.size,
          candidateId: candidate.id,
          retailer_domains: retailerDomains,
        }),
      });
      if (!res.ok) throw new Error(`Price refresh failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(null);
    }
  }

  async function refreshReviews() {
    setReviewError(null);
    setRefreshing("reviews");
    try {
      const res = await fetch("/api/tools/aggregate-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: candidate.brand,
          item_name: candidate.name,
          candidateId: candidate.id,
          review_domains: reviewDomains,
          focus_criteria: focusCriteria,
        }),
      });
      if (!res.ok) throw new Error(`Review refresh failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(null);
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
          <RefreshButton
            label="Refresh price"
            loading={refreshing === "price"}
            onClick={refreshPrice}
            className="mt-1.5"
          />
          {priceError && (
            <p className="mt-1.5 max-w-[12rem] text-xs text-red-600 dark:text-red-400">
              {priceError}
            </p>
          )}
        </div>
      </div>

      {priceSnapshot && priceSnapshot.domains_failed.length > 0 && (
        <p className="mt-3">
          <span
            title={priceSnapshot.domains_failed.join(", ")}
            className="inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
          >
            {priceSnapshot.domains_failed.length} site
            {priceSnapshot.domains_failed.length === 1 ? "" : "s"} not checked in last price run
          </span>
        </p>
      )}

      <div className="mt-3">
        {reviewSnapshot?.summary && <ReviewSummary summary={reviewSnapshot.summary} />}
        {reviewSnapshot && reviewSnapshot.review_links.length > 0 && (
          <ReviewLinksExpander links={reviewSnapshot.review_links} />
        )}
        <RefreshButton
          label="Refresh reviews"
          loading={refreshing === "reviews"}
          onClick={refreshReviews}
          className="mt-2"
        />
        {reviewError && (
          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{reviewError}</p>
        )}
      </div>

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

function ReviewSummary({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [summary]);

  return (
    <div>
      <p
        ref={ref}
        className={`text-sm text-zinc-600 dark:text-zinc-300 ${expanded ? "" : "line-clamp-3"}`}
      >
        {summary}
      </p>
      {clamped && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
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
