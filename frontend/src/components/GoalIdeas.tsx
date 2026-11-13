import { useState } from 'react';
import { Briefcase, Gift, GraduationCap, HeartPulse, Receipt, ShoppingBag, Shuffle, Sparkles } from 'lucide-react';
import { Button, Panel } from './ui.tsx';
import { GOAL_IDEAS, IDEA_GROUPS, ideaToPrefill, pickRandomIdeas, type GoalIdea, type IdeaGroup } from '../lib/goalIdeas.ts';
import { money } from '../lib/format.ts';

const GROUP_ICONS: Record<IdeaGroup, any> = { essentials: HeartPulse, school: GraduationCap, bills: Receipt, purchases: ShoppingBag, life: Gift, work: Briefcase };

export default function GoalIdeas({ onUse }: { onUse: (prefill: ReturnType<typeof ideaToPrefill>) => void }) {
  const [group, setGroup] = useState<IdeaGroup | 'all'>('all');
  const [featured, setFeatured] = useState<GoalIdea[]>(() => pickRandomIdeas(6));
  const shown = group === 'all' ? featured : GOAL_IDEAS.filter((i) => i.group === group);
  const shuffle = () => { setGroup('all'); setFeatured((current) => pickRandomIdeas(6, Math.random, GOAL_IDEAS, current.map((i) => i.id))); };
  const surprise = () => { const [one] = pickRandomIdeas(1); onUse(ideaToPrefill(one)); };
  return <Panel title="Goal ideas" description="Everyone saves for something different. Pick an idea, then adjust the amount and date to fit your life."
    actions={<><Button variant="secondary" size="sm" icon={Shuffle} onClick={shuffle}>Shuffle ideas</Button><Button variant="info" size="sm" icon={Sparkles} onClick={surprise}>Surprise me</Button></>}>
    <div id="goal-ideas" className="chips" role="group" aria-label="Filter goal ideas">
      {IDEA_GROUPS.map((g) => <button key={g.id} type="button" className="chip" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.label}</button>)}
    </div>
    <ul className="idea-grid">{shown.map((idea) => {
      const Icon = GROUP_ICONS[idea.group];
      return <li key={idea.id} className="idea-card">
        <span className="goal-icon-well"><Icon size={20} aria-hidden="true" /></span>
        <div className="idea-body"><h3>{idea.title}</h3><p className="muted">{idea.blurb}</p>
          <span className="idea-meta">Typical start: about {money(idea.estimate)} over {idea.months} months <em>(edit as needed)</em></span></div>
        <Button size="sm" variant="success" onClick={() => onUse(ideaToPrefill(idea))}>Use this idea<span className="sr-only">: {idea.title}</span></Button>
      </li>;
    })}</ul>
  </Panel>;
}
