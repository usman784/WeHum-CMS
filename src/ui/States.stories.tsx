import { ApiError } from '../lib/api';
import { Button } from './Button';
import { Card } from './Card';
import { Sparkline, StatBar } from './Charts';
import { PhoneCard, PhonePreview } from './PhonePreview';
import { Skeleton, SkeletonRows } from './Skeleton';
import { EmptyState, ErrorState, NoPermission } from './States';

export default { title: 'ui/States' };

export const EmptyErrorAndNoPermission = () => (
  <div className="grid gap-4 lg:grid-cols-2">
    <Card padded={false}>
      <EmptyState
        title="No daily message for Sunday"
        description="Members get it at their 07:00 window."
        action={<Button size="sm">Write message</Button>}
      />
    </Card>
    <Card padded={false}>
      <ErrorState
        error={new ApiError('INTERNAL', 500, 'The server could not load this page.', undefined, 'trace-7f3a91')}
        onRetry={() => {}}
      />
    </Card>
    <Card padded={false}>
      <ErrorState error={new ApiError('NETWORK', 0, 'Cannot reach the server. Check your connection.')} onRetry={() => {}} />
    </Card>
    <Card padded={false}>
      <NoPermission />
    </Card>
  </div>
);

export const Skeletons = () => (
  <div className="flex flex-col gap-4">
    <div className="flex gap-3">
      <Skeleton className="h-9 w-24" />
      <Skeleton className="h-9 w-40" />
      <Skeleton className="size-11 rounded-full" />
    </div>
    <Card padded={false}>
      <SkeletonRows rows={3} label="Loading sessions" />
    </Card>
  </div>
);

export const SparklineAndBars = () => (
  <div className="flex max-w-md flex-col gap-4">
    <div className="flex items-center gap-4">
      <Sparkline label="Meditations per day, last 7 days: rising" data={[2100, 2400, 2250, 2800, 2950, 3020, 3180]} />
      <Sparkline label="Cancellations, last 7 days: falling" data={[9, 8, 8, 6, 5, 5, 3]} className="text-success" />
    </div>
    <StatBar label="Completion" value={0.82} showValue />
    <StatBar label="Founding offer taken" value={0.412} showValue tone="success" />
    <StatBar label="World vibration" value={0.71} tone="vibration" />
  </div>
);

export const Phone = () => (
  <PhonePreview caption="Preview · Thu, Oct 1">
    <div className="flex items-center gap-2">
      <span className="flex-1 text-body font-bold">WeHum</span>
    </div>
    <div className="flex flex-col gap-0.5">
      <span className="text-xl font-bold">Good morning, Alex</span>
      <span className="text-overline font-normal normal-case tracking-normal text-text-muted">Thursday · Sustained focus conditioning</span>
    </div>
    <PhoneCard>
      <span className="self-start rounded-md bg-ember/15 px-1.5 py-1 text-overline text-ember-soft">
        MEDITATION OF THE DAY · 10 · 30 · 45 MIN
      </span>
      <span className="text-[17px] font-bold leading-tight">Releasing Cognitive Friction Before Work</span>
      <span className="text-overline font-normal normal-case tracking-normal text-text-muted">Raphael · Breathing</span>
      <span className="flex h-10 items-center justify-center rounded-btn bg-ember text-sm font-bold text-ember-on">Begin</span>
    </PhoneCard>
    <PhoneCard className="text-sm font-semibold">Silence Room</PhoneCard>
  </PhonePreview>
);
