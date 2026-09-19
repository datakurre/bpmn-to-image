/**
 * bpmn-js-token-simulation always labels every token "1" — it has no concept
 * of numbering concurrent tokens. Both browser bundles (the jsdom-evaluated
 * `browser-entry.ts` used for headless frame rendering, and `viewer-entry.ts`
 * used for the live interactive embed) tag scopes with a `tokenNumber` (see
 * `simulate.ts`'s `ScopeTracker`) and need this same patch to display it.
 */

interface AnimationCtor {
  prototype: {
    _getTokenSVG: (scope: { tokenNumber?: number }) => string;
  };
}

interface TokenCountCtor {
  prototype: {
    _getTokenHTML: (element: unknown, scope: { tokenNumber?: number }) => string;
  };
}

export function patchTokenNumberDisplay(
  AnimationClass: AnimationCtor,
  TokenCountClass: TokenCountCtor
): void {
  const originalGetTokenSVG = AnimationClass.prototype._getTokenSVG;
  AnimationClass.prototype._getTokenSVG = function (
    this: unknown,
    scope: { tokenNumber?: number }
  ): string {
    const svg = originalGetTokenSVG.call(this, scope);
    const tokenNumber = scope?.tokenNumber != null ? scope.tokenNumber : 1;
    return svg.replace(
      /(<text[^>]*class="[^"]*bts-text[^"]*"[^>]*>)\s*1\s*(<\/text>)/,
      `$1${tokenNumber}$2`
    );
  };

  const originalGetTokenHTML = TokenCountClass.prototype._getTokenHTML;
  TokenCountClass.prototype._getTokenHTML = function (
    this: unknown,
    element: unknown,
    scope: { tokenNumber?: number }
  ): string {
    const html = originalGetTokenHTML.call(this, element, scope);
    const tokenNumber = scope?.tokenNumber;
    if (tokenNumber != null) {
      return html.replace(
        /(<div[^>]*class="[^"]*bts-token-count[^"]*"[^>]*>)\s*[\d.]+\s*(<\/div>)/,
        `$1${tokenNumber}$2`
      );
    }
    return html;
  };
}
