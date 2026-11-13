import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast.tsx';

declare global {
  interface Window { __retry?: () => void }
}

function Harness() {
  const toast = useToast();
  return <>
    <button onClick={() => toast.success('Saved it.')}>success</button>
    <button onClick={() => toast.error('Boom.', { action: { label: 'Retry', onClick: window.__retry } })}>error</button>
    <button onClick={() => toast.warning('Careful.')}>warning</button>
    <button onClick={() => toast.info('FYI.')}>info</button>
  </>;
}
const setup = () => render(<ToastProvider><Harness /></ToastProvider>);
afterEach(() => vi.useRealTimers());

describe('toasts', () => {
  it('renders each type with the right role, title and icon-bearing markup', async () => {
    const user = userEvent.setup();
    setup();
    for (const name of ['success', 'error', 'warning', 'info']) await user.click(screen.getByRole('button', { name }));
    expect(screen.getByText('Saved it.').closest('.toast')).toHaveClass('toast-success');
    expect(screen.getByText('Saved it.').closest('.toast')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Boom.').closest('.toast')).toHaveClass('toast-error');
    expect(screen.getByText('Boom.').closest('.toast')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Careful.').closest('.toast')).toHaveClass('toast-warning');
    expect(screen.getByText('FYI.').closest('.toast')).toHaveClass('toast-info');
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveAttribute('aria-live', 'polite');
  });

  it('de-duplicates identical notifications instead of stacking them', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'success' }));
    await user.click(screen.getByRole('button', { name: 'success' }));
    await user.click(screen.getByRole('button', { name: 'success' }));
    expect(screen.getAllByText('Saved it.')).toHaveLength(1);
  });

  it('auto-dismisses success toasts but keeps errors until dismissed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup();
    await user.click(screen.getByRole('button', { name: 'success' }));
    await user.click(screen.getByRole('button', { name: 'error' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4600); });
    expect(screen.queryByText('Saved it.')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(screen.getByText('Boom.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.queryByText('Boom.')).not.toBeInTheDocument();
  });

  it('runs a Retry action and then dismisses the toast', async () => {
    window.__retry = vi.fn();
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'error' }));
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(window.__retry).toHaveBeenCalledOnce();
  });

  it('shows at most four toasts at once', async () => {
    function Many() { const t = useToast(); return <button onClick={() => [1, 2, 3, 4, 5, 6].forEach((n) => t.info(`msg ${n}`))}>many</button>; }
    const user = userEvent.setup();
    render(<ToastProvider><Many /></ToastProvider>);
    await user.click(screen.getByRole('button', { name: 'many' }));
    expect(document.querySelectorAll('.toast')).toHaveLength(4);
    expect(screen.getByText('msg 6')).toBeInTheDocument();
  });
});
