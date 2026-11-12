export async function copyText(value: string, fallbackInput: HTMLInputElement | HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Clipboard API unavailable (some desktop webviews): select the text and use the legacy command.
    const temporary = !fallbackInput || fallbackInput.value !== value;
    const input = temporary ? document.createElement('textarea') : fallbackInput;
    const previousFocus = document.activeElement;
    if (temporary) {
      input.value = value;
      Object.assign(input.style, { position: 'fixed', top: '0', opacity: '0' });
      document.body.appendChild(input);
    }
    input.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      if (temporary) input.remove();
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    }
  }
}

