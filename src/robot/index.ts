import TextRenderer, { type TextRendererConfig } from 'bpmn-js/lib/draw/TextRenderer';
import RobotTaskRenderer from './renderer';

interface TextPadding {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

interface TextStyle {
  fontSize?: number | string;
  fontFamily?: string;
  lineHeight?: number;
  [key: string]: unknown;
}

interface TextOptions {
  box?: { width: number; height?: number; x?: number; y?: number };
  style?: TextStyle;
  padding?: number | TextPadding;
  align?: string;
  [key: string]: unknown;
}

/**
 * Adjusts text options to ensure bounding box fits text.
 *
 * @param text - The text to render
 * @param options - Layout options
 * @returns Adjusted text options
 */
function adjustTextOptions(text: string, options?: TextOptions): TextOptions | undefined {
  if (!options?.box || !text) {
    return options;
  }
  const words = text.split(/\s+/);
  const style = options.style ?? {};
  let fontSize = '11px';
  if (typeof style.fontSize === 'number') {
    fontSize = `${style.fontSize}px`;
  } else if (typeof style.fontSize === 'string') {
    fontSize = style.fontSize;
  }
  const fontFamily =
    style.fontFamily ?? 'IBMPlexSans, open_sansregular, Helvetica, Arial, Verdana, sans-serif';

  let canvas: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
  }
  const ctx = canvas ? canvas.getContext('2d') : null;
  if (ctx) {
    ctx.font = `${fontSize} ${fontFamily}`;
  }

  let maxWordW = 0;
  for (const w of words) {
    if (!w) {
      continue;
    }
    const wLen = ctx ? ctx.measureText(w).width : w.length * 8;
    if (wLen > maxWordW) {
      maxWordW = wLen;
    }
  }

  let pad = 0;
  if (typeof options.padding === 'number') {
    pad = options.padding * 2;
  } else if (options.padding && typeof options.padding === 'object') {
    const p = options.padding;
    pad = (p.left ?? 0) + (p.right ?? 0);
  }

  const neededW = Math.ceil(maxWordW + pad) + 4;
  if (options.box.width < neededW) {
    return {
      ...options,
      box: {
        ...options.box,
        width: neededW,
      },
    };
  }
  return options;
}

/** bpmn-js aligns text "center-top" by default; only "left"/"right" opt out. */
function isCentered(align?: string): boolean {
  return align === undefined || align.startsWith('center');
}

/**
 * Custom text renderer extending bpmn-js TextRenderer to ensure proper box width.
 */
class CustomTextRenderer extends TextRenderer {
  static $inject = ['config.textRenderer'];

  constructor(config?: TextRendererConfig) {
    super({
      defaultStyle: {
        fontFamily: 'IBMPlexSans, open_sansregular, Helvetica, Arial, Verdana, sans-serif',
        fontSize: 12,
        lineHeight: 1.2,
        ...(config?.defaultStyle ?? {}),
      },
      externalStyle: {
        fontFamily: 'IBMPlexSans, open_sansregular, Helvetica, Arial, Verdana, sans-serif',
        fontSize: 11,
        lineHeight: 1.2,
        ...(config?.externalStyle ?? {}),
      },
    });

    const origCreateText = (
      this as unknown as { createText: (t: string, o?: TextOptions) => SVGElement }
    ).createText.bind(this);
    const origGetDimensions = (
      this as unknown as { getDimensions: (t: string, o?: TextOptions) => unknown }
    ).getDimensions.bind(this);

    (this as unknown as { createText: (t: string, o?: TextOptions) => SVGElement }).createText = (
      text: string,
      options?: TextOptions
    ): SVGElement => {
      const adjusted = adjustTextOptions(text, options);
      const element = origCreateText(text, adjusted);
      // Widening only grows the box to the right, which would push centered
      // text right by half the growth. Shift it back so it stays centered on
      // the original box.
      const growth = (adjusted?.box?.width ?? 0) - (options?.box?.width ?? 0);
      if (growth > 0 && isCentered(options?.align)) {
        element.querySelectorAll('tspan').forEach((tspan) => {
          const x = parseFloat(tspan.getAttribute('x') ?? '0');
          tspan.setAttribute('x', String(x - growth / 2));
        });
      }
      return element;
    };

    (this as unknown as { getDimensions: (t: string, o?: TextOptions) => unknown }).getDimensions =
      (text: string, options?: TextOptions): unknown => {
        const adjusted = adjustTextOptions(text, options);
        return origGetDimensions(text, adjusted);
      };
  }
}

export { RobotTaskRenderer, CustomTextRenderer };

export default {
  __init__: ['RobotTaskRenderer'],
  RobotTaskRenderer: ['type', RobotTaskRenderer],
  textRenderer: ['type', CustomTextRenderer],
};
