import { useState } from 'react';
import { SendHorizontal, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../api.ts';
import { localDate } from '../lib/format.ts';
import { Modal } from './Modal.tsx';
import { Button, FormAlert, Spinner } from './ui.tsx';

type Message = { role: 'user' | 'assistant'; content: string };

const STARTERS = [
  'How am I doing on my savings goals?',
  'What do my recent expenses suggest?',
  'How can I plan my next savings step?',
];

export default function AssistantDialog({ token, onClose }: { token: string | null; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I can help you understand your IponWise savings data and plan a next step.' },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ask = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    const history = messages.slice(-6);
    setBusy(true);
    setError('');
    setMessages((items) => [...items, { role: 'user', content: message }]);
    setDraft('');
    try {
      const response = await api.assistant(token, { message, history }, localDate());
      setMessages((items) => [...items, { role: 'assistant', content: response.reply }]);
    } catch (requestError: any) {
      setError(requestError?.message || 'The assistant could not respond. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <Modal title="IponWise assistant" description="Ask about your savings, goals, and recorded spending." onClose={onClose} busy={busy} size="lg">
    <div className="assistant-chat">
      <p className="assistant-disclosure"><ShieldCheck size={16} aria-hidden="true" />Your question and a minimized summary of your IponWise data are sent to Gemini. Do not enter passwords, PINs, one-time codes, or full card numbers.</p>
      <div className="assistant-messages" aria-live="polite" aria-label="Assistant conversation">
        {messages.map((item, index) => <article key={`${item.role}-${index}`} className={`assistant-message assistant-message-${item.role}`}>
          <strong>{item.role === 'assistant' ? 'IponWise assistant' : 'You'}</strong>
          <p>{item.content}</p>
        </article>)}
        {busy && <article className="assistant-message assistant-message-assistant assistant-thinking"><Spinner size={16} label="The assistant is thinking" /><span>Thinking…</span></article>}
      </div>
      {!messages.some((item) => item.role === 'user') && <div className="assistant-starters" aria-label="Suggested questions">
        {STARTERS.map((starter) => <Button key={starter} variant="secondary" size="sm" disabled={busy} onClick={() => ask(starter)}>{starter}</Button>)}
      </div>}
      <FormAlert>{error}</FormAlert>
      <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); ask(draft); }}>
        <label className="sr-only" htmlFor="assistant-question">Ask the IponWise assistant</label>
        <textarea id="assistant-question" className="control" value={draft} maxLength={1000} disabled={busy} placeholder="Ask about your goals, recent spending, or savings plan…" onChange={(event) => setDraft(event.target.value)} />
        <Button type="submit" icon={SendHorizontal} loading={busy} disabled={!draft.trim()}>Ask</Button>
      </form>
      <p className="assistant-disclaimer"><Sparkles size={14} aria-hidden="true" />Guidance is based on your recorded data and is not financial, tax, legal, lending, or investment advice.</p>
    </div>
  </Modal>;
}
