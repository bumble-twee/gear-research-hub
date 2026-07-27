import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { DeleteSearchButton } from "./DeleteSearchButton";
import { NewSearchButton } from "./NewSearchButton";
import { RefreshOnFocus } from "./RefreshOnFocus";
import { SEARCH_STATUS_STYLES } from "./searches/[id]/format";
import type { SearchRow } from "./searches/[id]/types";

// Has no dynamic route params to force per-request rendering (unlike
// /searches/[id]), so without this Next would statically prerender the
// searches list once at build time and never show rows created after.
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only, never in client code
);

interface CandidateStat {
  total: number;
  nonRejected: number;
  tried: number;
}

export default async function SearchesIndexPage() {
  const { data: searches, error: searchesErr } = await supabase
    .from("searches")
    .select("*")
    .order("created_at", { ascending: false });
  if (searchesErr) throw searchesErr;

  const searchRows = (searches ?? []) as SearchRow[];
  const searchIds = searchRows.map((s) => s.id);

  const statsBySearch = new Map<string, CandidateStat>();
  if (searchIds.length > 0) {
    const { data: candidates, error: candidatesErr } = await supabase
      .from("candidates")
      .select("search_id, status, fit_rating")
      .in("search_id", searchIds);
    if (candidatesErr) throw candidatesErr;

    for (const c of candidates ?? []) {
      const stat = statsBySearch.get(c.search_id) ?? {
        total: 0,
        nonRejected: 0,
        tried: 0,
      };
      stat.total += 1;
      if (c.status !== "rejected") {
        stat.nonRejected += 1;
        if (c.fit_rating !== null) stat.tried += 1;
      }
      statsBySearch.set(c.search_id, stat);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <RefreshOnFocus />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Searches</h1>
        <NewSearchButton />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {searchRows.map((search) => (
          <SearchCard
            key={search.id}
            search={search}
            stats={statsBySearch.get(search.id) ?? { total: 0, nonRejected: 0, tried: 0 }}
          />
        ))}
        {searchRows.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No searches yet. Start one above.
          </p>
        )}
      </div>
    </div>
  );
}

function SearchCard({ search, stats }: { search: SearchRow; stats: CandidateStat }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <Link href={`/searches/${search.id}`} className="block">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {search.title}
          </h2>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${SEARCH_STATUS_STYLES[search.status]}`}
          >
            {search.status}
          </span>
        </div>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          {stats.total} candidate{stats.total === 1 ? "" : "s"} · {stats.tried} of{" "}
          {stats.nonRejected} tried
        </p>
      </Link>
      <div className="mt-3 flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <DeleteSearchButton searchId={search.id} title={search.title} candidateCount={stats.total} />
      </div>
    </div>
  );
}
