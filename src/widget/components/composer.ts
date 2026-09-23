const MAX_TEXTAREA_HEIGHT_PX = 140;

/**
 * Caja de texto del chat: Enter envía, Shift+Enter agrega una línea nueva y el campo
 * crece con el contenido hasta un máximo.
 */
export class Composer {
  constructor(
    private readonly form: HTMLFormElement,
    private readonly textarea: HTMLTextAreaElement,
    private readonly onSubmit: (text: string) => void,
  ) {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit();
    });
    this.textarea.addEventListener('keydown', (event) => this.handleKeydown(event));
    this.textarea.addEventListener('input', () => this.autoResize());
  }

  focus(): void {
    this.textarea.focus();
  }

  setPlaceholder(text: string): void {
    this.textarea.placeholder = text;
  }

  private handleKeydown(event: KeyboardEvent): void {
    // isComposing: no enviar mientras un IME (acentos, japonés, etc.) está componiendo.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submit();
    }
  }

  private submit(): void {
    const text = this.textarea.value.trim();
    if (!text) return;
    this.textarea.value = '';
    this.autoResize();
    this.onSubmit(text);
  }

  private autoResize(): void {
    this.textarea.style.height = 'auto';
    this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }
}
