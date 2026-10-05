import { Badge, StatusText } from './Badge';
import { Button } from './Button';
import { Card, SectionCard } from './Card';
import { KpiTile } from './KpiTile';
import { LiveDot } from './LiveDot';
import { Chip } from './TabPills';

export default { title: 'ui/Card' };

export const Cards = () => (
  <div className="grid gap-4 md:grid-cols-2">
    <Card>
      <p className="text-text-body">A plain card: 16 px radius, 1 px border, surface background.</p>
    </Card>
    <SectionCard
      title="Needs attention"
      description="Things to fix before they reach the app"
      action={
        <Badge tone="teal" caps>
          Phase 2
        </Badge>
      }
    >
      <p className="text-sm text-text-muted">Section card with a heading, a description and an action slot.</p>
    </SectionCard>
    <SectionCard
      size="h2"
      title="Team & roles"
      action={
        <Button variant="outline" size="sm">
          Invite member
        </Button>
      }
    >
      <p className="text-sm text-text-muted">Settings sections use the larger heading.</p>
    </SectionCard>
  </div>
);

export const KpiTiles = () => (
  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <KpiTile label="Meditating right now" value="214" hint="Across 3 time zones" live />
    <KpiTile label="Meditations today" value="3,180" hint="+12% vs last Thursday" hintTone="success" />
    <KpiTile label="Paying members" value="600" hint="112 in trial · $3,904 / month" />
    <KpiTile label="Library" value="142" loading />
    <KpiTile size="sm" label="Trial to paid" value="38%" hint="Last 30 days" />
    <KpiTile size="sm" label="Payment problems" value="4" hint="Needs a look" hintTone="warning" />
  </div>
);

export const Badges = () => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Published</Badge>
      <Badge tone="success">Live</Badge>
      <Badge tone="teal">Scheduled</Badge>
      <Badge tone="warning">Draft</Badge>
      <Badge tone="ember">Missing</Badge>
      <Badge tone="danger">Hidden</Badge>
      <Badge tone="info">Video</Badge>
      <Badge tone="lilac">Loop</Badge>
      <Badge tone="solid" size="sm">
        7
      </Badge>
      <Badge tone="ember" caps>
        Premium
      </Badge>
      <Badge tone="success" caps>
        Free
      </Badge>
    </div>
    <div className="flex flex-wrap items-center gap-4">
      <StatusText tone="success">Published</StatusText>
      <StatusText tone="warning">Draft</StatusText>
      <StatusText tone="teal">Scheduled</StatusText>
      <StatusText tone="ember">Audio missing</StatusText>
      <StatusText tone="muted">Archived</StatusText>
    </div>
    <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
      <span className="inline-flex items-center gap-2">
        <LiveDot pulse /> Live
      </span>
      <span className="inline-flex items-center gap-2">
        <LiveDot tone="warning" /> Reconnecting
      </span>
      <span className="inline-flex items-center gap-2">
        <LiveDot tone="off" /> Offline
      </span>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Chip>Breathing</Chip>
      <Chip onRemove={() => {}}>Sleep</Chip>
    </div>
  </div>
);
