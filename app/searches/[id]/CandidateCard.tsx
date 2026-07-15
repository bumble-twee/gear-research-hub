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
}: {
  searchId: string;
  candidate: CandidateRow;
  priceSnapshot: PriceSnapshotRow | null;
  reviewSnapshot: ReviewSnapshotRow | null;
}) {
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

        {candidate.current_price !== null && (
          <div className="text-right">
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {formatPrice(candidate.current_price, candidate.current_price_currency)}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {candidate.current_price_retailer}
              {candidate.price_updated_at && ` · ${humanizeAge(candidate.price_updated_at)}`}
            </div>
          </div>
        )}
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

      {reviewSnapshot?.summary && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          {reviewSnapshot.summary}
        </p>
      )}
      {reviewSnapshot && reviewSnapshot.review_links.length > 0 && (
        <ReviewLinksExpander links={reviewSnapshot.review_links} />
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
    </div>
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
