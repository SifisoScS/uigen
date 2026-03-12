"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  GitFork,
  Loader2,
  Package,
  ChevronLeft,
  ChevronRight,
  Tag,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { remixArtifact } from "@/actions/remix-artifact";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ArtifactItem {
  id: string;
  name: string;
  version: string;
  description: string | null;
  previewImage: string | null;
  remixCount: number;
  tags: string[];
  policyType: string | null;
  authorId: string | null;
  createdAt: string;
  parentArtifactId: string | null;
  parentArtifactName: string | null;
}

interface RegistryClientProps {
  initialItems: ArtifactItem[];
  initialTotal: number;
  popularTags: string[];
}

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "createdAt", label: "Newest" },
  { value: "remixCount", label: "Most remixed" },
] as const;

// ── ArtifactCard ─────────────────────────────────────────────────────────────

function ArtifactCard({ item }: { item: ArtifactItem }) {
  const router = useRouter();
  const [remixing, setRemixing] = useState(false);

  async function handleRemix(e: React.MouseEvent) {
    e.preventDefault();
    setRemixing(true);
    try {
      const { projectId } = await remixArtifact(item.id);
      toast.success("Remix created — opening your project…");
      router.push(`/${projectId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remix failed");
      setRemixing(false);
    }
  }

  return (
    <div className="group flex flex-col bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden hover:border-[#2e2e2e] transition-colors">
      {/* Preview image */}
      <Link
        href={`/share/${item.id}`}
        className="block flex-shrink-0 h-40 bg-[#0d0d0d] overflow-hidden"
      >
        {item.previewImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.previewImage}
            alt={item.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-10 w-10 text-neutral-800" />
          </div>
        )}
      </Link>

      {/* Card body */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/share/${item.id}`}
              className="text-sm font-medium text-neutral-100 hover:text-white leading-snug line-clamp-1"
            >
              {item.name}
            </Link>
            <span className="flex-shrink-0 text-[10px] text-neutral-500 font-mono bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5">
              v{item.version}
            </span>
          </div>

          {item.description && (
            <p className="mt-1 text-xs text-neutral-500 leading-relaxed line-clamp-2">
              {item.description}
            </p>
          )}

          {/* Ancestry provenance */}
          {item.parentArtifactId && item.parentArtifactName ? (
            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-neutral-600">
              <GitFork className="h-2.5 w-2.5 flex-shrink-0" />
              Remixed from{" "}
              <Link
                href={`/share/${item.parentArtifactId}`}
                className="text-blue-500 hover:text-blue-400 truncate max-w-[120px]"
                onClick={(e) => e.stopPropagation()}
              >
                {item.parentArtifactName}
              </Link>
            </p>
          ) : item.remixCount > 0 ? (
            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-neutral-600">
              <GitFork className="h-2.5 w-2.5 flex-shrink-0" />
              Remixed into {item.remixCount} artifact
              {item.remixCount !== 1 ? "s" : ""}
            </p>
          ) : null}
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1a1a1a] border border-[#252525] text-neutral-600"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1f1f1f]">
          <div className="flex items-center gap-3">
            {item.policyType && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                <ShieldCheck className="h-3 w-3" />
                {item.policyType}
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px] text-neutral-600">
              <GitFork className="h-3 w-3" />
              {item.remixCount}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] gap-1 border-[#2a2a2a] text-neutral-400 hover:text-neutral-200 hover:bg-[#1a1a1a]"
            onClick={handleRemix}
            disabled={remixing}
          >
            {remixing ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <GitFork className="h-2.5 w-2.5" />
            )}
            Remix
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── RegistryClient ────────────────────────────────────────────────────────────

export function RegistryClient({
  initialItems,
  initialTotal,
  popularTags,
}: RegistryClientProps) {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"createdAt" | "remixCount">("createdAt");
  const [items, setItems] = useState<ArtifactItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(initialTotal > PAGE_SIZE);
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(
    async (opts: {
      search?: string;
      tag?: string | null;
      sort?: "createdAt" | "remixCount";
      pageOffset?: number;
    }) => {
      const s = opts.search ?? search;
      const t = opts.tag !== undefined ? opts.tag : activeTag;
      const sort = opts.sort ?? sortBy;
      const off = opts.pageOffset ?? 0;

      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (s) params.set("search", s);
        if (t) params.set("tags", t);
        if (sort !== "createdAt") params.set("sortBy", sort);
        if (off > 0) params.set("offset", String(off));

        const res = await fetch(`/api/registry?${params.toString()}`);
        const data = (await res.json()) as {
          items: ArtifactItem[];
          total: number;
          hasMore: boolean;
        };
        setItems(data.items);
        setTotal(data.total);
        setHasMore(data.hasMore);
        setOffset(off);
      } catch {
        toast.error("Failed to load registry");
      } finally {
        setLoading(false);
      }
    },
    [search, activeTag, sortBy]
  );

  function handleSearch(value: string) {
    setSearch(value);
    fetchPage({ search: value, pageOffset: 0 });
  }

  function handleTagToggle(tag: string) {
    const next = activeTag === tag ? null : tag;
    setActiveTag(next);
    fetchPage({ tag: next, pageOffset: 0 });
  }

  function handleSort(value: "createdAt" | "remixCount") {
    setSortBy(value);
    fetchPage({ sort: value, pageOffset: 0 });
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-6">
      {/* Search + sort bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search artifacts…"
            className="pl-9 bg-[#111111] border-[#2a2a2a] text-neutral-100 placeholder:text-neutral-600 focus-visible:ring-neutral-600"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#111111] border border-[#2a2a2a] rounded-md p-0.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSort(opt.value)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                sortBy === opt.value
                  ? "bg-[#252525] text-neutral-200"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tag filter pills */}
      {popularTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {popularTags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagToggle(tag)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                activeTag === tag
                  ? "bg-blue-600/20 border-blue-600/50 text-blue-400"
                  : "bg-[#111111] border-[#2a2a2a] text-neutral-500 hover:text-neutral-300 hover:border-[#3a3a3a]"
              }`}
            >
              <Tag className="h-3 w-3" />
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Package className="h-12 w-12 text-neutral-800" />
          <p className="text-neutral-500 text-sm">No artifacts found.</p>
          {(search || activeTag) && (
            <button
              onClick={() => {
                setSearch("");
                setActiveTag(null);
                fetchPage({ search: "", tag: null, pageOffset: 0 });
              }}
              className="text-xs text-blue-500 hover:text-blue-400 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((item) => (
              <ArtifactCard key={item.id} item={item} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-neutral-500">
                {total} artifact{total !== 1 ? "s" : ""} · page {currentPage}{" "}
                of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs border-[#2a2a2a] text-neutral-400 hover:text-neutral-200 disabled:opacity-40"
                  disabled={offset === 0}
                  onClick={() =>
                    fetchPage({ pageOffset: Math.max(0, offset - PAGE_SIZE) })
                  }
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs border-[#2a2a2a] text-neutral-400 hover:text-neutral-200 disabled:opacity-40"
                  disabled={!hasMore}
                  onClick={() => fetchPage({ pageOffset: offset + PAGE_SIZE })}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
