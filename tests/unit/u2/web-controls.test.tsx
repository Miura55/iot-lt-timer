// @vitest-environment jsdom
import React from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TimerControls } from '../../../apps/web/src/timer-app.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const running = { id: 'session', version: 4, state: 'running', remainingSeconds: 45, notifications: [] };
const paused = { ...running, version: 5, state: 'paused' };

describe('U2 mobile timer controls', () => {
  afterEach(cleanup);
  it('shows pause for running state with an accessible name', () => {
    const { getByRole, getByTestId } = render(<TimerControls state={running} loading={false} onAction={vi.fn()} />);
    expect(getByRole('button', { name: '一時停止' }).disabled).toBe(false);
    expect(getByTestId('timer-pause-button').tagName).toBe('BUTTON');
  });
  it('sends pause action when the focused button is activated by keyboard', async () => {
    const onAction = vi.fn();
    const { getByTestId } = render(<TimerControls state={running} loading={false} onAction={onAction} />);
    const button = getByTestId('timer-pause-button');
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledWith('pause');
  });
  it('shows resume and cancel in paused state but hides pause', () => {
    const { getByRole, queryByTestId } = render(<TimerControls state={paused} loading={false} onAction={vi.fn()} />);
    expect(getByRole('button', { name: '再開' }).tagName).toBe('BUTTON');
    expect(getByRole('button', { name: 'キャンセル' }).tagName).toBe('BUTTON');
    expect(queryByTestId('timer-pause-button')).toBeNull();
  });
  it('does not show controls in terminal state', () => {
    const { queryByRole } = render(<TimerControls state={{ ...paused, state: 'cancelled' }} loading={false} onAction={vi.fn()} />);
    expect(queryByRole('button')).toBeNull();
  });
  it('disables duplicate actions while an operation is in flight', () => {
    const { getByTestId } = render(<TimerControls state={running} loading onAction={vi.fn()} />);
    expect((getByTestId('timer-pause-button') as HTMLButtonElement).disabled).toBe(true);
    expect((getByTestId('timer-cancel-button') as HTMLButtonElement).disabled).toBe(true);
  });
  it('keeps controls usable at a 320px viewport with responsive wrapping and touch target dimensions', () => {
    const { container } = render(<TimerControls state={running} loading={false} onAction={vi.fn()} />);
    const css = readFileSync(resolve(process.cwd(), 'apps/web/src/style.css'), 'utf8');
    expect(css).toContain('min-width:320px');
    expect(css).toContain('@media(max-width:420px)');
    expect(css).toContain('.controls{display:flex;gap:12px;justify-content:center;flex-wrap:wrap');
    expect(css).toContain('.secondary,.danger{min-height:48px;min-width:120px');
    expect((container.querySelectorAll('.controls button')).length).toBe(2);
    expect(container.querySelector('.controls')?.getAttribute('aria-label')).toBe('タイマー操作');
  });
});
