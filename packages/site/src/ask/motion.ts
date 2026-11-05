/**
 * The panel's slide in and out (docs/spec/ask-the-library.md S7). The panel keeps its
 * `hidden` attribute as the one truth about whether it is there: opening clears it at
 * once and a class plays the slide; closing sets a class, and `hidden` follows when the
 * slide ends. Under `prefers-reduced-motion` nothing plays and `hidden` is set at once,
 * so closing takes effect in the same call and focus can return in it.
 *
 * No timer: a slide ends on `animationend`, which cannot fire when there is no
 * animation, so the reduced-motion case never waits for one.
 */
export interface MotionPanel {
  hidden: boolean | 'until-found';
  inert: boolean;
  readonly classList: {
    add(...names: string[]): void;
    remove(...names: string[]): void;
    contains(name: string): boolean;
  };
  addEventListener(type: string, listener: (event: Event) => void): void;
}

export interface PanelMotion {
  /** Shows the panel and, unless motion is reduced, slides it in. */
  enter(): void;
  /** Hides the panel: at once when motion is reduced, after the slide out otherwise. */
  leave(): void;
}

export function createPanelMotion(panel: MotionPanel, reduced: () => boolean): PanelMotion {
  panel.addEventListener('animationend', (event) => {
    // An animation ending on something inside the panel is not the panel's slide.
    if ((event.target as unknown) !== panel) return;
    panel.classList.remove('is-entering');
    if (panel.classList.contains('is-leaving')) {
      panel.classList.remove('is-leaving');
      panel.hidden = true;
      panel.inert = false;
    }
  });
  return {
    enter() {
      panel.classList.remove('is-leaving');
      panel.inert = false;
      panel.hidden = false;
      if (!reduced()) panel.classList.add('is-entering');
    },
    leave() {
      panel.classList.remove('is-entering');
      if (reduced()) {
        panel.classList.remove('is-leaving');
        panel.hidden = true;
        return;
      }
      // Still on screen for the slide, but nothing in it can take focus or a click.
      panel.inert = true;
      panel.classList.add('is-leaving');
    },
  };
}
