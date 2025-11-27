import { SigmaFieldMatcher } from './field-matcher.js';

/**
 * SigmaConditionEvaluator - Parse and evaluate Sigma condition expressions
 *
 * Supports:
 * - Boolean operators: AND, OR, NOT
 * - Quantifiers: 1 of, all of
 * - Patterns: selection*, them
 * - Parentheses for grouping
 *
 * Examples:
 * - "selection"
 * - "selection and keywords"
 * - "selection or (keywords and timeframe)"
 * - "1 of selection*"
 * - "all of them"
 * - "not selection"
 */

interface EvaluationContext {
  logData: Record<string, any>;
  detectionBlock: Record<string, any>;
  caseSensitive?: boolean;
}

export class SigmaConditionEvaluator {
  /**
   * Evaluate a Sigma condition string
   */
  static evaluate(
    condition: string,
    context: EvaluationContext
  ): boolean {
    const { logData, detectionBlock, caseSensitive = false } = context;

    // Tokenize condition
    const tokens = this.tokenize(condition);

    // Parse and evaluate expression tree
    return this.evaluateTokens(tokens, logData, detectionBlock, caseSensitive);
  }

  /**
   * Tokenize condition string into tokens
   */
  private static tokenize(condition: string): string[] {
    // Replace operators with special markers to preserve them
    const normalized = condition
      .toLowerCase()
      .replace(/(\d+)\s+of/g, '$1_OF') // "1 of" → "1_OF" (Must be before generic OF replacement)
      .replace(/\(/g, ' ( ')
      .replace(/\)/g, ' ) ')
      .replace(/\band\b/g, ' AND ')
      .replace(/\bor\b/g, ' OR ')
      .replace(/\bnot\b/g, ' NOT ')
      .replace(/\bof\b/g, ' OF ')
      .replace(/\ball\b/g, ' ALL ');

    // Split on whitespace and filter empty
    return normalized
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  /**
   * Evaluate tokenized condition
   */
  private static evaluateTokens(
    tokens: string[],
    logData: Record<string, any>,
    detectionBlock: Record<string, any>,
    caseSensitive: boolean
  ): boolean {
    // Parse into expression tree and evaluate
    const { result } = this.parseExpression(
      tokens,
      0,
      logData,
      detectionBlock,
      caseSensitive
    );

    return result;
  }

  /**
   * Parse and evaluate expression (recursive descent parser)
   */
  private static parseExpression(
    tokens: string[],
    startIndex: number,
    logData: Record<string, any>,
    detectionBlock: Record<string, any>,
    caseSensitive: boolean
  ): { result: boolean; nextIndex: number } {
    let result = false;
    let i = startIndex;

    // Parse first term
    const first = this.parseTerm(tokens, i, logData, detectionBlock, caseSensitive);
    result = first.result;
    i = first.nextIndex;

    // Handle operators (AND, OR)
    while (i < tokens.length) {
      const operator = tokens[i];

      if (operator === ')') {
        // End of grouped expression
        break;
      }

      if (operator === 'AND') {
        i++;
        const next = this.parseTerm(tokens, i, logData, detectionBlock, caseSensitive);
        result = result && next.result;
        i = next.nextIndex;
      } else if (operator === 'OR') {
        i++;
        const next = this.parseTerm(tokens, i, logData, detectionBlock, caseSensitive);
        result = result || next.result;
        i = next.nextIndex;
      } else {
        // Unknown operator or end of expression
        break;
      }
    }

    return { result, nextIndex: i };
  }

  /**
   * Parse and evaluate term (identifier, NOT, quantifier, or grouped expression)
   */
  private static parseTerm(
    tokens: string[],
    startIndex: number,
    logData: Record<string, any>,
    detectionBlock: Record<string, any>,
    caseSensitive: boolean
  ): { result: boolean; nextIndex: number } {
    let i = startIndex;

    if (i >= tokens.length) {
      return { result: false, nextIndex: i };
    }

    const token = tokens[i];

    // NOT operator
    if (token === 'NOT') {
      i++;
      const inner = this.parseTerm(tokens, i, logData, detectionBlock, caseSensitive);
      return { result: !inner.result, nextIndex: inner.nextIndex };
    }

    // Grouped expression: (...)
    if (token === '(') {
      i++;
      const inner = this.parseExpression(tokens, i, logData, detectionBlock, caseSensitive);
      i = inner.nextIndex;

      // Expect closing parenthesis
      if (i < tokens.length && tokens[i] === ')') {
        i++;
      }

      return { result: inner.result, nextIndex: i };
    }

    // Quantifiers: "1 of selection*", "all of them"
    if (token.match(/^\d+_OF$/) || token === 'ALL') {
      i++;

      // Expect "OF" for "ALL OF"
      if (token === 'ALL' && i < tokens.length && tokens[i] === 'OF') {
        i++;
      }

      // Get pattern (e.g., "selection*", "them")
      const pattern = i < tokens.length ? tokens[i] : '';
      i++;

      const result = this.evaluateQuantifier(
        token,
        pattern,
        logData,
        detectionBlock,
        caseSensitive
      );

      return { result, nextIndex: i };
    }

    // Identifier (selection name)
    const result = this.evaluateIdentifier(token, logData, detectionBlock, caseSensitive);
    i++;

    return { result, nextIndex: i };
  }

  /**
   * Evaluate quantifier expression
   */
  private static evaluateQuantifier(
    quantifier: string,
    pattern: string,
    logData: Record<string, any>,
    detectionBlock: Record<string, any>,
    caseSensitive: boolean
  ): boolean {
    // Find matching selection blocks
    const matchingSelections = this.findMatchingSelections(pattern, detectionBlock);

    if (matchingSelections.length === 0) {
      return false;
    }

    // Evaluate each selection
    const results = matchingSelections.map((selectionName) =>
      this.evaluateIdentifier(selectionName, logData, detectionBlock, caseSensitive)
    );

    // Apply quantifier logic
    if (quantifier === 'ALL') {
      // ALL OF → all must match
      return results.every((r) => r);
    }

    // "N_OF" → at least N must match
    const match = quantifier.match(/^(\d+)_OF$/);
    if (match) {
      const n = parseInt(match[1], 10);
      const matchCount = results.filter((r) => r).length;
      return matchCount >= n;
    }

    return false;
  }

  /**
   * Find selection names matching a pattern
   */
  private static findMatchingSelections(
    pattern: string,
    detectionBlock: Record<string, any>
  ): string[] {
    const selectionNames = Object.keys(detectionBlock).filter(
      (key) => key !== 'condition' && key !== 'timeframe'
    );

    // "them" → all selections
    if (pattern === 'them') {
      return selectionNames;
    }

    // Wildcard pattern (e.g., "selection*")
    if (pattern.includes('*')) {
      const regex = new RegExp(
        `^${pattern.replace(/\*/g, '.*')}$`
      );
      return selectionNames.filter((name) => regex.test(name));
    }

    // Exact match
    return selectionNames.includes(pattern) ? [pattern] : [];
  }

  /**
   * Evaluate identifier (selection name)
   */
  private static evaluateIdentifier(
    identifier: string,
    logData: Record<string, any>,
    detectionBlock: Record<string, any>,
    caseSensitive: boolean
  ): boolean {
    // Get selection block
    const selection = detectionBlock[identifier];

    if (!selection) {
      return false;
    }

    // Handle array of keywords (search ANY keyword in ANY text field)
    if (Array.isArray(selection)) {
      return this.matchKeywords(logData, selection, caseSensitive);
    }

    if (typeof selection !== 'object') {
      return false;
    }

    // Use SigmaFieldMatcher to evaluate selection (for field:value pairs)
    return SigmaFieldMatcher.matchSelection(logData, selection, caseSensitive);
  }

  /**
   * Match keywords array against all text fields in log data
   */
  private static matchKeywords(
    logData: Record<string, any>,
    keywords: string[],
    caseSensitive: boolean
  ): boolean {
    // Collect all string values from log data
    const textFields: string[] = [];

    Object.values(logData).forEach((value) => {
      if (typeof value === 'string') {
        textFields.push(value);
      }
    });

    // Check if ANY keyword matches ANY text field
    return keywords.some((keyword) => {
      const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();

      return textFields.some((text) => {
        const searchText = caseSensitive ? text : text.toLowerCase();
        return searchText.includes(searchKeyword);
      });
    });
  }

  /**
   * Parse Sigma detection block and evaluate against log data
   */
  static evaluateDetection(
    detectionBlock: Record<string, any>,
    logData: Record<string, any>,
    caseSensitive: boolean = false
  ): boolean {
    // Extract condition string
    const condition = detectionBlock.condition;

    if (!condition || typeof condition !== 'string') {
      return false;
    }

    // Evaluate condition
    return this.evaluate(condition, {
      logData,
      detectionBlock,
      caseSensitive,
    });
  }
}
