export function createIdeBridgeScript(): string {
  return `(() => {
    const SOURCE = 'dsh-vscode-bridge';
    const reply = message => window.parent.postMessage({ source: SOURCE, ...message }, '*');
    const setTextarea = (textarea, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(textarea, value); else textarea.value = value;
      textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      textarea.focus();
    };
    const composer = () => {
      const candidates = [...document.querySelectorAll('textarea')]
        .filter(item => !item.disabled && !item.readOnly && item.getAttribute('aria-hidden') !== 'true');
      return candidates.at(-1);
    };
    window.addEventListener('message', event => {
      if (event.source !== window.parent || !event.data || event.data.source !== 'dsh-vscode-shell') return;
      if (event.data.type === 'newSession') {
        const labels = ['New session', '新建会话'];
        const button = [...document.querySelectorAll('button')].find(item =>
          labels.includes(item.getAttribute('aria-label') || '') || labels.includes((item.textContent || '').trim()),
        );
        if (button) button.click();
        return;
      }
      if (event.data.type !== 'insertContext' || typeof event.data.text !== 'string') return;
      const textarea = composer();
      if (!textarea) { reply({ type: 'contextResult', ok: false }); return; }
      const separator = textarea.value.trim().length > 0 ? '\\n\\n' : '';
      setTextarea(textarea, textarea.value + separator + event.data.text);
      reply({ type: 'contextResult', ok: true });
    });
    document.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a');
      if (!anchor) return;
      const value = anchor.getAttribute('data-file-path') || anchor.getAttribute('href') || '';
      if (!value.startsWith('file://')) return;
      event.preventDefault();
      event.stopPropagation();
      reply({ type: 'openFile', value });
    }, true);
    reply({ type: 'ready' });
  })();`
}
