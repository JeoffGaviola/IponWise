/** Suggested amounts are editable estimates, not prices or financial advice. */
export type IdeaGroup = 'essentials' | 'school' | 'bills' | 'purchases' | 'life' | 'work';
export type HelperKind = 'purchase' | 'installment' | 'emergency' | null;

export type GoalIdea = {
  id: string; group: IdeaGroup; title: string; category: string; priority: 'essential' | 'high' | 'normal' | 'optional';
  estimate: number; months: number; blurb: string; helper: HelperKind;
};

export const IDEA_GROUPS: Array<{ id: IdeaGroup | 'all'; label: string }> = [
  { id: 'all', label: 'All ideas' }, { id: 'essentials', label: 'Emergencies & health' }, { id: 'school', label: 'School & tuition' },
  { id: 'bills', label: 'Bills & loans' }, { id: 'purchases', label: 'Big purchases' }, { id: 'life', label: 'Life events' }, { id: 'work', label: 'Work & business' },
];

export const GOAL_IDEAS: GoalIdea[] = [
  { id: 'emergency', group: 'essentials', title: 'Emergency fund', category: 'Emergency fund', priority: 'essential', estimate: 30000, months: 12, helper: 'emergency', blurb: 'A safety net for the unexpected — sized from your own monthly costs.' },
  { id: 'hospital', group: 'essentials', title: 'Hospital bill fund', category: 'Medical & healthcare', priority: 'essential', estimate: 50000, months: 10, helper: null, blurb: 'Set money aside for admissions, surgery or a family member’s treatment.' },
  { id: 'maintenance', group: 'essentials', title: 'Medicine & check-ups', category: 'Medical & healthcare', priority: 'essential', estimate: 12000, months: 6, helper: 'installment', blurb: 'Regular maintenance medicines, lab tests and dental visits.' },
  { id: 'family-help', group: 'essentials', title: 'Family emergency reserve', category: 'Family needs', priority: 'essential', estimate: 20000, months: 8, helper: null, blurb: 'For sudden needs back home — repairs, travel or support.' },
  { id: 'tuition', group: 'school', title: 'Tuition fees', category: 'Tuition & education', priority: 'high', estimate: 25000, months: 5, helper: 'installment', blurb: 'Cover the next semester’s tuition and miscellaneous fees.' },
  { id: 'school-supplies', group: 'school', title: 'School supplies & uniform', category: 'Tuition & education', priority: 'high', estimate: 6000, months: 3, helper: null, blurb: 'Books, uniforms, shoes and project materials.' },
  { id: 'board-exam', group: 'school', title: 'Review & board exam fees', category: 'Tuition & education', priority: 'high', estimate: 15000, months: 6, helper: null, blurb: 'Review classes, application and licensing fees.' },
  { id: 'loan', group: 'bills', title: 'Loan payments', category: 'Debt repayment', priority: 'essential', estimate: 36000, months: 12, helper: 'installment', blurb: 'Monthly amortization for a personal, salary or housing loan.' },
  { id: 'installment', group: 'bills', title: 'Installment & credit card balance', category: 'Debt repayment', priority: 'high', estimate: 15000, months: 6, helper: 'installment', blurb: 'Pay down a gadget installment or card balance on schedule.' },
  { id: 'rent', group: 'bills', title: 'Rent & deposit', category: 'Rent & housing', priority: 'essential', estimate: 24000, months: 4, helper: 'installment', blurb: 'Advance rent and security deposit for a new place.' },
  { id: 'utilities', group: 'bills', title: 'Utilities & insurance buffer', category: 'Utilities & essential bills', priority: 'high', estimate: 8000, months: 4, helper: null, blurb: 'Electricity, water, internet and insurance premiums.' },
  { id: 'laptop', group: 'purchases', title: 'New laptop', category: 'Gadgets & electronics', priority: 'normal', estimate: 45000, months: 6, helper: 'purchase', blurb: 'For school, work or freelancing — pay in full or save a down payment.' },
  { id: 'phone', group: 'purchases', title: 'Smartphone', category: 'Gadgets & electronics', priority: 'optional', estimate: 25000, months: 5, helper: 'purchase', blurb: 'Replace an old phone without going into debt.' },
  { id: 'motorcycle', group: 'purchases', title: 'Motorcycle', category: 'Vehicle (car or motorcycle)', priority: 'normal', estimate: 90000, months: 12, helper: 'purchase', blurb: 'Down payment plus registration and insurance.' },
  { id: 'car', group: 'purchases', title: 'Car down payment', category: 'Vehicle (car or motorcycle)', priority: 'normal', estimate: 250000, months: 24, helper: 'purchase', blurb: 'Down payment, registration, insurance and first-year costs.' },
  { id: 'appliance', group: 'purchases', title: 'Home appliance', category: 'Gadgets & electronics', priority: 'optional', estimate: 20000, months: 5, helper: 'purchase', blurb: 'Refrigerator, washing machine or aircon.' },
  { id: 'home', group: 'purchases', title: 'Home down payment', category: 'Rent & housing', priority: 'normal', estimate: 300000, months: 36, helper: 'purchase', blurb: 'A long-term goal for a house, lot or condo.' },
  { id: 'wedding', group: 'life', title: 'Wedding', category: 'Personal', priority: 'normal', estimate: 150000, months: 24, helper: null, blurb: 'Venue, food, attire and the little things.' },
  { id: 'new-baby', group: 'life', title: 'Baby fund', category: 'Family needs', priority: 'high', estimate: 60000, months: 9, helper: null, blurb: 'Delivery, check-ups and baby essentials.' },
  { id: 'travel', group: 'life', title: 'Trip or vacation', category: 'Travel & leisure', priority: 'optional', estimate: 30000, months: 8, helper: null, blurb: 'Fare, stay and spending money for a well-earned break.' },
  { id: 'christmas', group: 'life', title: 'Christmas & Noche Buena', category: 'Family needs', priority: 'normal', estimate: 10000, months: 6, helper: null, blurb: 'Gifts and the holiday table, without the January stress.' },
  { id: 'business', group: 'work', title: 'Business capital', category: 'Business capital', priority: 'normal', estimate: 50000, months: 10, helper: null, blurb: 'Starting stock or equipment for a small business.' },
  { id: 'course', group: 'work', title: 'Online course or certification', category: 'Tuition & education', priority: 'normal', estimate: 10000, months: 4, helper: null, blurb: 'Upskill for a better job or freelance rate.' },
  { id: 'tools', group: 'work', title: 'Work tools & equipment', category: 'Business capital', priority: 'normal', estimate: 18000, months: 5, helper: 'purchase', blurb: 'Camera, tools or a work bike that earns its keep.' },
];

/** Fisher–Yates with an injectable RNG so tests are deterministic. Never mutates the input. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function pickRandomIdeas(count = 6, rng: () => number = Math.random, pool: readonly GoalIdea[] = GOAL_IDEAS, exclude: readonly string[] = []): GoalIdea[] {
  const available = pool.filter((i) => !exclude.includes(i.id));
  const firstPerGroup: GoalIdea[] = [];
  for (const group of shuffle([...new Set(available.map((i) => i.group))], rng)) {
    const one = shuffle(available.filter((i) => i.group === group), rng)[0];
    if (one) firstPerGroup.push(one);
  }
  const rest = shuffle(available.filter((i) => !firstPerGroup.includes(i)), rng);
  return [...firstPerGroup, ...rest].slice(0, count);
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dateAfterMonths = (months: number, from = new Date()): string => {
  const d = new Date(from); d.setHours(12, 0, 0, 0); d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const ideaToPrefill = (idea: GoalIdea, from = new Date()) => ({
  name: idea.title, category: idea.category, priority: idea.priority, target: idea.estimate, description: idea.blurb,
  deadline: dateAfterMonths(idea.months, from), helper: idea.helper,
});
