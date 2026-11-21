import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TabButtons } from '../../src/components/ui/TabButtons';

const TABS = [
  { id: 'recommended', label: 'Recommended', count: 4 },
  { id: 'saved', label: 'Saved', count: 2 },
  { id: 'in_progress', label: 'In progress', count: 0 },
] as const;

describe('the shared tab buttons', () => {
  it('renders real buttons, not clickable text', () => {
    render(
      <TabButtons ariaLabel="Sections" tabs={TABS} value="recommended" onChange={() => undefined} />
    );

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.tagName).toBe('BUTTON');
      expect(tab.getAttribute('type')).toBe('button');
    }
  });

  it('marks the active tab and keeps its count inside the button', () => {
    render(<TabButtons ariaLabel="Sections" tabs={TABS} value="saved" onChange={() => undefined} />);

    const active = screen.getByRole('tab', { name: /Saved/ });
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(active.className).toContain('bg-[var(--accent-primary)]');
    expect(active.textContent).toContain('2');

    const inactive = screen.getByRole('tab', { name: /Recommended/ });
    expect(inactive.getAttribute('aria-selected')).toBe('false');
    expect(inactive.className).not.toContain('bg-[var(--accent-primary)]');
  });

  it('moves with the arrow keys and ignores other keys', async () => {
    const onChange = vi.fn();
    render(
      <TabButtons ariaLabel="Sections" tabs={TABS} value="recommended" onChange={onChange} idPrefix="qa" />
    );

    const active = screen.getByRole('tab', { name: /Recommended/ });
    active.focus();
    fireEvent.keyDown(active, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('saved');

    fireEvent.keyDown(active, { key: 'Tab' });
    expect(onChange).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(document.activeElement?.id).toBe('qa-saved'));
  });
});
