import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Megaphone,
  Plus,
  Send,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  MessageSquare,
  Settings2,
  Zap,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
type ScheduleType   = 'ONCE' | 'DAILY' | 'WEEKLY';

interface Campaign {
  id: string;
  name: string;
  templateName: string;
  scheduleType: ScheduleType;
  status: CampaignStatus;
  totalSent: number;
  totalFailed: number;
  lastRunAt: string | null;
}

interface WhatsAppStatus {
  configured: boolean;
  phoneNumber?: string;
}

// ── Badge meta ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<CampaignStatus, { label: string; cls: string }> = {
  DRAFT:     { label: 'Draft',     cls: 'bg-muted text-muted-foreground' },
  ACTIVE:    { label: 'Active',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  PAUSED:    { label: 'Paused',    cls: 'bg-amber-100 text-amber-700' },
  COMPLETED: { label: 'Completed', cls: 'bg-blue-100 text-blue-700' },
};

const SCHEDULE_META: Record<ScheduleType, { label: string; cls: string }> = {
  ONCE:   { label: 'Once',   cls: 'bg-muted text-muted-foreground' },
  DAILY:  { label: 'Daily',  cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  WEEKLY: { label: 'Weekly', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
};

// ── Small helpers ──────────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Campaign Card ──────────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const statusMeta   = STATUS_META[campaign.status]   ?? { label: campaign.status,   cls: 'bg-muted text-muted-foreground' };
  const scheduleMeta = SCHEDULE_META[campaign.scheduleType] ?? { label: campaign.scheduleType, cls: 'bg-muted text-muted-foreground' };

  return (
    <Link
      to={`/owner/marketing/campaigns/${campaign.id}`}
      className="group block bg-card border rounded-xl p-5 hover:border-amber-400 hover:shadow-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate leading-snug group-hover:text-amber-700 transition-colors">
            {campaign.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            <span className="text-xs text-muted-foreground truncate">{campaign.templateName}</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5 group-hover:text-amber-500 transition-colors" />
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <Badge label={scheduleMeta.label} cls={scheduleMeta.cls} />
        <Badge label={statusMeta.label}   cls={statusMeta.cls} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t">
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground leading-none">Sent</p>
            <p className="text-sm font-semibold text-foreground mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {campaign.totalSent.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground leading-none">Failed</p>
            <p className="text-sm font-semibold text-foreground mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {campaign.totalFailed.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      {/* Last run */}
      <div className="flex items-center gap-1.5 mt-3">
        <Clock className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
        <span className="text-xs text-muted-foreground">
          Last run: {formatDate(campaign.lastRunAt)}
        </span>
      </div>
    </Link>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4">
        <Megaphone className="w-7 h-7 text-amber-500" />
      </div>
      <h3 className="text-base font-semibold text-foreground">No campaigns yet</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
        Create your first WhatsApp campaign to reach customers directly on their phones.
      </p>
      <Link
        to="/owner/marketing/campaigns/new"
        className="mt-5 inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <Plus className="w-4 h-4" />
        New Campaign
      </Link>
    </div>
  );
}

// ── Summary bar ────────────────────────────────────────────────────────────────

function SummaryBar({ campaigns }: { campaigns: Campaign[] }) {
  const total     = campaigns.length;
  const active    = campaigns.filter((c) => c.status === 'ACTIVE').length;
  const totalSent = campaigns.reduce((acc, c) => acc + c.totalSent, 0);
  const totalRecipients = campaigns.reduce((acc, c) => acc + c.totalSent + c.totalFailed, 0);

  const stats = [
    { icon: Megaphone,     label: 'Total Campaigns', value: total,                          color: 'text-amber-600' },
    { icon: Zap,           label: 'Active',          value: active,                         color: 'text-emerald-600' },
    { icon: Send,          label: 'Messages Sent',   value: totalSent.toLocaleString('en-IN'), color: 'text-blue-600' },
    { icon: Users,         label: 'Total Reached',   value: totalRecipients.toLocaleString('en-IN'), color: 'text-purple-600' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="bg-card border rounded-xl px-4 py-4 flex items-center gap-3">
          <div className={`shrink-0 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none truncate">{label}</p>
            <p className="text-lg font-bold text-foreground mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const navigate = useNavigate();

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const { data: waStatus } = useQuery<WhatsAppStatus>({
    queryKey: ['whatsapp-status'],
    queryFn: () => api.get('/campaigns/whatsapp/status').then((r: any) => r.data?.data ?? r.data),
    retry: false,
  });

  const campaigns: Campaign[] = campaignsData ?? [];
  const isConfigured = waStatus?.configured ?? true; // default true to avoid flash

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-amber-600" />
            <h1 className="text-2xl font-bold text-foreground">WhatsApp Marketing</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Send targeted messages to your customers via WhatsApp
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/owner/marketing/templates"
            className="inline-flex items-center gap-1.5 border bg-card hover:bg-muted/50 text-foreground text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Settings2 className="w-4 h-4" />
            Manage Templates
          </Link>
          <Link
            to="/owner/marketing/campaigns/new"
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </Link>
        </div>
      </div>

      {/* WhatsApp config banner */}
      {waStatus && !isConfigured && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-4">
          <div className="shrink-0 mt-0.5">
            <Zap className="w-5 h-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              WhatsApp is not configured
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              Connect your WhatsApp Business account to start sending campaigns. Go to{' '}
              <Link
                to="/owner/settings"
                className="underline underline-offset-2 font-medium hover:text-amber-900 dark:hover:text-amber-200"
              >
                Settings
              </Link>{' '}
              and enter your WhatsApp API credentials to get started.
            </p>
          </div>
          <button
            onClick={() => navigate('/owner/settings')}
            className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 whitespace-nowrap"
          >
            Go to Settings
          </button>
        </div>
      )}

      {/* WhatsApp configured success indicator */}
      {waStatus?.configured && waStatus.phoneNumber && (
        <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            WhatsApp connected — <span className="font-medium">{waStatus.phoneNumber}</span>
          </p>
        </div>
      )}

      {/* Summary bar */}
      {!campaignsLoading && campaigns.length > 0 && (
        <SummaryBar campaigns={campaigns} />
      )}

      {/* Campaign grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Campaigns
        </h2>

        {campaignsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border rounded-xl p-5 animate-pulse space-y-3">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="flex gap-2 mt-2">
                  <div className="h-5 bg-muted rounded-full w-14" />
                  <div className="h-5 bg-muted rounded-full w-14" />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t mt-3">
                  <div className="h-8 bg-muted rounded" />
                  <div className="h-8 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.length === 0 ? (
              <EmptyState />
            ) : (
              campaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
