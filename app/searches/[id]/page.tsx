import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { CandidateList } from "./CandidateList";
import { LocalTime } from "./LocalTime";
import { SEARCH_STATUS_STYLES, currencySymbol, ownedDuration } from "./format";
import type {
  CandidateRow,
  OwnedItemRow,
  PriceSnapshotRow,
  ReviewSnapshotRow,
  SearchRow,
} from "./types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only, never in client code
);

export default async function SearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: search, error: searchErr } = await supabase
    .from("searches")
    .select("*")
    .eq("id", id)
    .single();

  if (searchErr || !search) {
    notFound();
  }
  const searchRow = search as SearchRow;

  const [{ data: candidates, error: candidatesErr }, ownedItem] = await Promise.all([
    supabase
      .from("candidates")
      .select("*")
      .eq("search_id", id)
      .order("created_at", { ascending: true }),
    searchRow.replaces_item_id
      ? supabase
          .from("owned_items")
          .select("*")
          .eq("id", searchRow.replaces_item_id)
          .single()
          .then((r) => r.data as OwnedItemRow | null)
      : Promise.resolve(null),
  ]);
  if (candidatesErr) throw candidatesErr;

  const candidateRows = (candidates ?? []) as CandidateRow[];
  const candidateIds = candidateRows.map((c) => c.id);

  let priceSnapshots: PriceSnapshotRow[] = [];
  let reviewSnapshots: ReviewSnapshotRow[] = [];
  if (candidateIds.length > 0) {
    const [priceRes, reviewRes] = await Promise.all([
      supabase
        .from("price_snapshots")
        .select("*")
        .in("candidate_id", candidateIds)
        .order("captured_at", { ascending: false }),
      supabase
        .from("review_snapshots")
        .select("*")
        .in("candidate_id", candidateIds)
        .order("captured_at", { ascending: false }),
    ]);
    if (priceRes.error) throw priceRes.error;
    if (reviewRes.error) throw reviewRes.error;
    priceSnapshots = (priceRes.data ?? []) as PriceSnapshotRow[];
    reviewSnapshots = (reviewRes.data ?? []) as ReviewSnapshotRow[];
  }

  // Rows come back newest-first; keep only the first (latest) one seen
  // per candidate. Snapshot lookups are plain objects (not Maps) since
  // they cross the server/client boundary as props to CandidateList.
  const priceByCandidate: Record<string, PriceSnapshotRow | null> = {};
  for (const snap of priceSnapshots) {
    if (!(snap.candidate_id in priceByCandidate)) {
      priceByCandidate[snap.candidate_id] = snap;
    }
  }
  const reviewByCandidate: Record<string, ReviewSnapshotRow | null> = {};
  for (const snap of reviewSnapshots) {
    if (!(snap.candidate_id in reviewByCandidate)) {
      reviewByCandidate[snap.candidate_id] = snap;
    }
  }

  // "Tried" covers non-rejected candidates that have been fitted at
  // least once; rejected candidates aren't part of the denominator.
  const nonRejected = candidateRows.filter((c) => c.status !== "rejected");
  const triedCount = nonRejected.filter((c) => c.fit_rating !== null).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Header
        search={searchRow}
        ownedItem={ownedItem}
        triedCount={triedCount}
        totalCount={nonRejected.length}
      />
      <RequirementsChips search={searchRow} />

      <CandidateList
        searchId={id}
        candidates={candidateRows}
        priceByCandidate={priceByCandidate}
        reviewByCandidate={reviewByCandidate}
      />
    </div>
  );
}

function Header({
  search,
  ownedItem,
  triedCount,
  totalCount,
}: {
  search: SearchRow;
  ownedItem: OwnedItemRow | null;
  triedCount: number;
  totalCount: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {search.title}
        </h1>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${SEARCH_STATUS_STYLES[search.status]}`}
        >
          {search.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {search.category} · Created <LocalTime iso={search.created_at} dateOnly /> ·{" "}
        {triedCount} of {totalCount} tried
      </p>
      {ownedItem && <ReplacingLine ownedItem={ownedItem} />}
    </div>
  );
}

function ReplacingLine({ ownedItem }: { ownedItem: OwnedItemRow }) {
  const parts: string[] = [`Replacing ${ownedItem.brand} ${ownedItem.name}`];
  if (ownedItem.purchased_at) {
    const { years, months } = ownedDuration(ownedItem.purchased_at);
    parts.push(`owned ${years}y ${months}m`);
  }
  if (ownedItem.purchase_price !== null) {
    parts.push(
      `bought for ${currencySymbol(ownedItem.currency)}${ownedItem.purchase_price.toFixed(2)}`
    );
  }
  return (
    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{parts.join(" · ")}</p>
  );
}

function RequirementsChips({ search }: { search: SearchRow }) {
  const featureEntries = Object.entries(search.required_features ?? {});
  const priorities = search.priorities ?? [];

  if (featureEntries.length === 0 && priorities.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      {featureEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {featureEntries.map(([key, value]) => (
            <span
              key={key}
              className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {key}: {typeof value === "object" ? JSON.stringify(value) : String(value)}
            </span>
          ))}
        </div>
      )}
      {priorities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {priorities.map((priority, i) => (
            <span
              key={priority}
              className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            >
              {i + 1}. {priority}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
