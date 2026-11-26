// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

afterEach(() => cleanup());

describe('Modal', () => {
  it('is announced as a modal dialog with its title', () => {
    render(<Modal labelledBy="t" onClose={() => undefined}><h2 id="t">Title</h2><button type="button">Ok</button></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Title' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('closes with Escape and with a click outside', () => {
    const onClose = vi.fn();
    render(<Modal className="overlay" backdropClassName="backdrop" ariaLabel="d" onClose={onClose}><section><button type="button">Ok</button></section></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.backdrop') as Element);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('a click on the overlay itself closes it when there is no separate backdrop, a click inside does not', () => {
    const onClose = vi.fn();
    render(<Modal className="overlay" ariaLabel="d" onClose={onClose}><section><button type="button">Ok</button></section></Modal>);
    fireEvent.click(screen.getByText('Ok'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.overlay') as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on a click outside when a form is open, but still on Escape', () => {
    const onClose = vi.fn();
    render(<Modal className="overlay" ariaLabel="d" onClose={onClose} closeOnBackdrop={false}><input aria-label="x" /></Modal>);
    fireEvent.click(document.querySelector('.overlay') as Element);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a forced choice answers neither Escape nor a click outside', () => {
    render(<Modal className="overlay" backdropClassName="backdrop" ariaLabel="d"><button type="button">Choose</button></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(document.querySelector('.backdrop') as Element);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('moves the focus in, keeps Tab inside and gives the focus back to the opener', async () => {
    const user = userEvent.setup();
    const Host = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <button type="button">Outside</button>
          {open ? <Modal ariaLabel="d" onClose={() => setOpen(false)}><button type="button">First</button><button type="button">Last</button></Modal> : null}
        </>
      );
    };
    render(<Host />);
    await user.click(screen.getByText('Open'));
    expect(document.activeElement).toBe(screen.getByText('First'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByText('Last'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByText('First'));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByText('Last'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByText('Open'));
  });

  it('leaves the focus on a control that took it itself', () => {
    render(<Modal ariaLabel="d" onClose={() => undefined}><button type="button">A</button><input aria-label="B" autoFocus /></Modal>);
    expect(document.activeElement).toBe(screen.getByLabelText('B'));
  });

  it('only the topmost dialog answers Escape', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    render(<><Modal ariaLabel="lower" onClose={lower}><button type="button">a</button></Modal><Modal ariaLabel="upper" onClose={upper}><button type="button">b</button></Modal></>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  it('an Escape already used by a control inside (it called preventDefault) does not also close it', () => {
    const onClose = vi.fn();
    render(<Modal ariaLabel="d" onClose={onClose}><input aria-label="x" onKeyDown={(event) => { if (event.key === 'Escape') event.preventDefault(); }} /></Modal>);
    fireEvent.keyDown(screen.getByLabelText('x'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
