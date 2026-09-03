import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Pencil,
  Play,
  Pause,
  Send,
  Loader2,
  CheckCircle2,
  MailCheck,
  BookOpen,
  XCircle,
  Clock,
  Users,
  Calendar,
  RefreshCw,
  Tag,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  templateName: string | null;
  scheduleType: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  audienceFilter: Record<string, unknown> | null;
  stats: {
    totalSent: number;
    delivered: number;
    read: number;
    failed: number;
  } | null;
}

interface CampaignMessage {
  id: string;
  phone: string;
  customerName: string | null;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'OPTED_OUT';
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failReason: string | null;
}

interface MessagesResponse {
  data: CampaignMessage[];
  total: number;
  page: number;
  limit: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  ARCHIVED: 'bg-muted text-muted-foreground/60',
};

const MESSAGE_STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  PENDING:   { label: 'Pending',    bg: 'bg-gray-100',    text: 'text-gray-600'    },
  SENT:      { label: 'Sent',       bg: 'bg-blue-100',    text: 'text-blue-700'    },
  DELIVERED: { label: 'Delivered',  bg: 'bg-amber-100',   text: 'text-amber-700'   },
  READ:      { label: 'Read',       bg: 'bg-green-100',   text: 'text-green-700'   },
  FAILED:    { label: 'Failed',     bg: 'bg-red-100',     text: 'text-red-600'     },
  OPTED_OUT: { label: 'Opted Out',  bg: 'bg-purple-100',  text: 'text-purple-700'  },
};

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pct(count: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((count / total) * 100)}%`;
}

function summariseFilter(filter: Record<string, unknown> | null) {
  if (!filter || Object.keys(filter).length === 0) return 'All customers';
  return Object.entries(filter)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · ');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status, colorClass }: { status: string; colorClass: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${colorClass}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function MsgStatusBadge({ status }: { status: string }) {
  const cfg = MESSAGE_STATUS_CONFIG[status] ?? {
    label: status,
    bg: 'bg-muted',
    text: 'text-muted-foreground',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  total: number;
  accent: string;
}

function StatCard({ icon, label, count, total, accent }: StatCardProps) {
  return (
    <div className="bg-card rounded-xl border p-4 flex flex-col gap-2 min-w-0">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
        {icon}
      </div>
      <div>
        <p
          className="text-2xl font-bold text-foreground tabular-nums"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {count.toLocaleString('en-IN')}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {label}{' '}
          {total > 0 && (
            <span className="font-medium text-foreground/60">{pct(count, total)}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border overflow-hidden">
      <div className="px-5 py-3.5 border-b">
        <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          {title}
        </h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right max-w-xs truncate">{value ?? '—'}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  // ── Fetch campaign ──────────────────────────────────────────────────────────

  const {
    data: campaign,
    isLoading: campaignLoading,
    isError: campaignError,
  } = useQuery<Campaign>({
    queryKey: ['campaign', id],
    queryFn: () =>
      api.get(`/campaigns/${id}`).then((r: any) => r.data.data ?? r.data),
    enabled: !!id,
  });

  // ── Fetch messages ──────────────────────────────────────────────────────────

  const {
    data: messagesResp,
    isLoading: messagesLoading,
  } = useQuery<MessagesResponse>({
    queryKey: ['campaign-messages', id, page],
    queryFn: () =>
      api
        .get(`/campaigns/${id}/messages`, { params: { page, limit: PAGE_SIZE } })
        .then((r: any) => r.data.data ?? r.data),
    enabled: !!id,
  });

  // ── Activate mutation ───────────────────────────────────────────────────────

  const activateMutation = useMutation({
    mutationFn: () =>
      api.post(`/campaigns/${id}/activate`).then((r: any) => r.data),
    onSuccess: () => {
      toast.success('Campaign activated');
      qc.invalidateQueries({ queryKey: ['campaign', id] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Failed to activate campaign'),
  });

  // ── Pause mutation ──────────────────────────────────────────────────────────

  const pauseMutation = useMutation({
    mutationFn: () =>
      api.post(`/campaigns/${id}/pause`).then((r: any) => r.data),
    onSuccess: () => {
      toast.success('Campaign paused');
      qc.invalidateQueries({ queryKey: ['campaign', id] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Failed to pause campaign'),
  });

  // ── Send now mutation ───────────────────────────────────────────────────────

  const sendNowMutation = useMutation({
    mutationFn: () =>
      api.post(`/campaigns/${id}/send-now`).then((r: any) => r.data),
    onSuccess: () => {
      toast.success('Messages queued for immediate delivery');
      qc.invalidateQueries({ queryKey: ['campaign', id] });
      qc.invalidateQueries({ queryKey: ['campaign-messages', id] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Failed to send now'),
  });

  // ── Loading state ───────────────────────────────────────────────────────────

  if (campaignLoading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl">
        <div className="h-10 w-64 skeleton rounded-lg" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 skeleton rounded-xl" />
          ))}
        </div>
        <div className="h-40 skeleton rounded-xl" />
        <div className="h-64 skeleton rounded-xl" />
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────

  if (campaignError || !campaign) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-5 text-sm">
          Campaign not found or failed to load.{' '}
          <button onClick={() => navigate(-1)} className="underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const stats = campaign.stats ?? {
    totalSent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
  };

  const messages = messagesResp?.data ?? [];
  const totalMessages = messagesResp?.total ?? 0;
  const totalPages = Math.ceil(totalMessages / PAGE_SIZE);

  const isDraftOrPaused =
    campaign.status === 'DRAFT' || campaign.status === 'PAUSED';
  const isActive = campaign.status === 'ACTIVE';
  const anyActionPending =
    activateMutation.isPending ||
    pauseMutation.isPending ||
    sendNowMutation.isPending;

  return (
    <div className="p-6 space-y-5 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Link
              to="/owner/marketing"
              className="text-muted-foreground/60 hover:text-muted-foreground text-sm flex items-center gap-1 mr-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Marketing
            </Link>
            <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
            <StatusBadge
              status={campaign.status}
              colorClass={
                CAMPAIGN_STATUS_COLORS[campaign.status] ??
                'bg-muted text-muted-foreground'
              }
            />
          </div>
        </div>
        <Link
          to={`/owner/marketing/campaigns/${id}/edit`}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Link>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Send className="w-4 h-4 text-blue-600" />}
          label="Total Sent"
          count={stats.totalSent}
          total={stats.totalSent}
          accent="bg-blue-50"
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4 text-amber-600" />}
          label="Delivered"
          count={stats.delivered}
          total={stats.totalSent}
          accent="bg-amber-50"
        />
        <StatCard
          icon={<BookOpen className="w-4 h-4 text-green-600" />}
          label="Read"
          count={stats.read}
          total={stats.totalSent}
          accent="bg-green-50"
        />
        <StatCard
          icon={<XCircle className="w-4 h-4 text-red-500" />}
          label="Failed"
          count={stats.failed}
          total={stats.totalSent}
          accent="bg-red-50"
        />
      </div>

      {/* ── Actions bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {isDraftOrPaused && (
          <button
            onClick={() => activateMutation.mutate()}
            disabled={anyActionPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {activateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Activate
          </button>
        )}

        {isActive && (
          <button
            onClick={() => pauseMutation.mutate()}
            disabled={anyActionPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {pauseMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
            Pause
          </button>
        )}

        <button
          onClick={() => sendNowMutation.mutate()}
          disabled={anyActionPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {sendNowMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MailCheck className="w-4 h-4" />
          )}
          Send Now
        </button>
      </div>

      {/* ── Campaign info grid ── */}
      <SectionCard title="Campaign Details">
        <div className="space-y-0.5">
          <InfoRow
            label="Template"
            value={
              campaign.templateName ? (
                <span className="inline-flex items-center gap-1">
                  <Tag className="w-3 h-3 text-muted-foreground" />
                  {campaign.templateName}
                </span>
              ) : null
            }
          />
          <InfoRow
            label="Schedule type"
            value={
              campaign.scheduleType ? (
                <span className="inline-flex items-center gap-1 capitalize">
                  <RefreshCw className="w-3 h-3 text-muted-foreground" />
                  {campaign.scheduleType.toLowerCase().replace('_', ' ')}
                </span>
              ) : null
            }
          />
          <InfoRow
            label="Last run"
            value={
              campaign.lastRunAt ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  {fmtDate(campaign.lastRunAt)}
                </span>
              ) : null
            }
          />
          <InfoRow
            label="Next run"
            value={
              campaign.nextRunAt ? (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  {fmtDate(campaign.nextRunAt)}
                </span>
              ) : null
            }
          />
          <InfoRow
            label="Audience filter"
            value={
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground/80">
                  {summariseFilter(campaign.audienceFilter)}
                </span>
              </span>
            }
          />
        </div>
      </SectionCard>

      {/* ── Messages table ── */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Message Delivery
          </h2>
          {totalMessages > 0 && (
            <span className="text-xs text-muted-foreground">
              {totalMessages.toLocaleString('en-IN')} total
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          {messagesLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-9 skeleton rounded-lg" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground/60">
              No messages recorded yet.
            </div>
          ) : (
            <table
              className="w-full text-sm"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                    Sent At
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                    Delivered At
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                    Read At
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                    Fail Reason
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {messages.map((msg) => (
                  <tr
                    key={msg.id}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-foreground/80 whitespace-nowrap">
                      {msg.phone}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {msg.customerName ?? (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <MsgStatusBadge status={msg.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(msg.sentAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(msg.deliveredAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(msg.readAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-red-500 max-w-[200px] truncate">
                      {msg.failReason ?? (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs font-medium border rounded-lg text-muted-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs font-medium border rounded-lg text-muted-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
