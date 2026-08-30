/**
 * Minimal ambient typings for dependencies that don't ship their own
 * TypeScript declarations for the entry points used here.
 */

declare module 'bpmn-moddle' {
  export class BpmnModdle {
    constructor(additionalPackages?: Record<string, unknown>);
    fromXML(xml: string): Promise<{ rootElement: any; references: any[]; warnings: any[] }>;
  }
}

declare module 'gifenc' {
  export type Palette = number[][];

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: Record<string, unknown>
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: string
  ): Uint8Array;

  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: Record<string, unknown>
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  }

  export function GIFEncoder(options?: Record<string, unknown>): GIFEncoderInstance;
}
