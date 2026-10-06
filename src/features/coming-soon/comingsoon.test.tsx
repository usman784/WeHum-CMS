import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { comingSoon } from '../../mocks/comingsoon';
import { findToast, h1, openApp } from '../../test/app';
import { a11yViolations } from '../../test/render';
import { patternLabel, patternProblem } from './api';

describe('Breathwork & milestones', () => {
  it('templates, lessons and milestones; passes the a11y check', async () => {
    openApp('/coming-soon');
    expect(await h1('Breathwork & milestones')).toBeInTheDocument();
    const templates = await screen.findByRole('list', { name: 'Breathing templates' });
    expect(within(templates).getByText('4 · 7 · 8')).toBeInTheDocument();
    expect(within(templates).getByText('4 · 4 · 4 · 4')).toBeInTheDocument();
    expect(within(templates).getByText('Draft')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Milestones' })).toHaveTextContent('1,880 people reached it');
    expect(screen.getByText('No lessons yet.')).toBeInTheDocument();
    expect(await a11yViolations()).toEqual([]);
  });

  it('a new template: bad beats are refused; a valid one is saved and published', async () => {
    openApp('/coming-soon');
    await userEvent.click(await screen.findByRole('button', { name: 'New template' }));
    const dialog = screen.getByRole('dialog', { name: 'New breathing template' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled(); // no name yet
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Energy');
    const inBeat = within(dialog).getByRole('spinbutton', { name: 'In' });
    await userEvent.clear(inBeat);
    await userEvent.type(inBeat, '0');
    await userEvent.tab();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Breathe in and out for at least 1 second');
    await userEvent.clear(inBeat);
    await userEvent.type(inBeat, '2');
    await userEvent.tab();
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Status' }), 'live');
    await userEvent.click(save);
    expect(await findToast('Template added')).toBeInTheDocument();
    expect(comingSoon.calls[0]).toMatchObject({ method: 'POST', path: '/breath-patterns', body: { name: 'Energy', inhaleSec: 2 } });
    expect(comingSoon.calls[1]).toMatchObject({ method: 'PATCH', body: { status: 'live' } });
  });

  it('edit a template; someone else saved first → told, list reloads', async () => {
    openApp('/coming-soon');
    const templates = await screen.findByRole('list', { name: 'Breathing templates' });
    await userEvent.click(within(templates).getByRole('button', { name: /Calming/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit “Calming”' });
    comingSoon.patterns[0]!.version = 5;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await findToast('Someone else changed this template')).toBeInTheDocument();
  });

  it('lessons: add two published meditations, reorder, save', async () => {
    openApp('/coming-soon');
    const pick = await screen.findByRole('combobox', { name: 'Add a lesson' });
    await waitFor(() => expect(within(pick).getAllByRole('option').length).toBeGreaterThan(2));
    const [first, second] = within(pick)
      .getAllByRole('option')
      .filter((o) => (o as HTMLOptionElement).value)
      .map((o) => (o as HTMLOptionElement).value);
    await userEvent.selectOptions(pick, first!);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.selectOptions(pick, second!);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const lessons = screen.getByRole('list', { name: 'Lessons' });
    await userEvent.click(within(lessons).getAllByRole('button', { name: /^Move .* up$/ })[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Save lessons' }));
    expect(await findToast('Lessons saved')).toBeInTheDocument();
    expect(comingSoon.lessons.value.lessons).toEqual([second, first]);
  });

  it('an editor cannot delete templates; a moderator has no access', async () => {
    openApp('/coming-soon', 'editor');
    await screen.findByRole('list', { name: 'Breathing templates' });
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
  });

  it('an owner deletes a template after confirming', async () => {
    openApp('/coming-soon');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Coherent' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await findToast('Template deleted')).toBeInTheDocument();
    expect(comingSoon.calls).toContainEqual({ method: 'DELETE', path: '/breath-patterns/bp3' });
  });

  it('moderators have no Breathwork & milestones screen', async () => {
    openApp('/coming-soon', 'moderator');
    expect(await screen.findByText('No permission')).toBeInTheDocument();
  });
});

describe('pattern helpers', () => {
  it('labels and checks match the app and the API', () => {
    expect(patternLabel({ inhaleSec: 4, hold1Sec: 7, exhaleSec: 8, hold2Sec: 0 })).toBe('4 · 7 · 8');
    expect(patternLabel({ inhaleSec: 4, hold1Sec: 4, exhaleSec: 4, hold2Sec: 4 })).toBe('4 · 4 · 4 · 4');
    expect(patternProblem({ inhaleSec: 20, hold1Sec: 20, exhaleSec: 20, hold2Sec: 1, rounds: 5 })).toBe('One round is at most 60 seconds');
    expect(patternProblem({ inhaleSec: 4, hold1Sec: 0, exhaleSec: 4, hold2Sec: 0, rounds: 5 })).toBeNull();
  });
});
