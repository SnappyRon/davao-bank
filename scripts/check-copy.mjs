#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
export const DEFAULT_TARGETS = ['apps/mobile/src', 'apps/admin/src'];
export const DEFAULT_ALLOWLIST = 'scripts/check-copy.allow.json';

export const VALID_RULES = new Set([
  'uppercase-copy',
  'php-currency',
  'exclamation-mark',
  'raw-uuid',
]);

const UUID_LITERAL_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const FORMATTER_CALLS = new Set([
  'formatReferenceId',
  'receiptReference',
  'ledgerReference',
]);

const UUID_PROPERTIES = new Set([
  'id',
  'transaction_id',
  'user_id',
  'account_id',
  'actor_id',
  'entity_id',
  'schedule_id',
  'request_id',
  'biller_id',
  'ledger_entry_id',
  'related_transaction_id',
  'transactionId',
  'accountId',
  'userId',
  'requestId',
  'scheduleId',
  'billerId',
]);

const STANDALONE_UUID_VARS = new Set([
  'uuid',
  'transaction_id',
  'user_id',
  'account_id',
  'actor_id',
  'entity_id',
  'schedule_id',
  'request_id',
  'biller_id',
  'ledger_entry_id',
  'related_transaction_id',
  'transactionId',
  'accountId',
  'userId',
  'requestId',
  'scheduleId',
  'billerId',
]);

const TECHNICAL_JSX_ATTRS = new Set([
  'key',
  'id',
  'testID',
  'nativeID',
  'className',
  'htmlFor',
  'href',
  'src',
  'type',
  'name',
  'variant',
  'color',
  'align',
  'size',
  'mode',
  'behavior',
  'keyboardType',
  'returnKeyType',
  'autoCapitalize',
  'textContentType',
  'autoComplete',
  'clearButtonMode',
  'submitBehavior',
  'importantForAccessibility',
  'accessibilityRole',
  'accessibilityLiveRegion',
  'role',
  'aria-live',
  'aria-controls',
  'inputMode',
  'UTI',
  'mimeType',
  'facing',
  'tint',
  'stroke',
  'strokeWidth',
  'strokeDasharray',
  'strokeLinecap',
  'strokeLinejoin',
  'fill',
  'd',
  'viewBox',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'offset',
  'stopColor',
  'stopOpacity',
  'textAnchor',
  'fontFamily',
  'fontWeight',
  'fontSize',
]);

const COPY_JSX_ATTRS = new Set([
  'title',
  'subtitle',
  'label',
  'placeholder',
  'helperText',
  'error',
  'description',
  'message',
  'eyebrow',
  'footnote',
  'confirmLabel',
  'cancelLabel',
  'confirmText',
  'cancelText',
  'actionTitle',
  'contextualActionTitle',
  'emptyTitle',
  'emptyMessage',
  'ledgerEffect',
  'voiceOverSummary',
  'dialogTitle',
  'promptMessage',
  'accessibilityLabel',
  'accessibilityHint',
  'aria-label',
  'aria-description',
  'alt',
]);

const TECHNICAL_METHODS = new Set([
  'from',
  'select',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'order',
  'rpc',
  'push',
  'replace',
  'redirect',
  'revalidatePath',
  'match',
  'split',
  'includes',
  'startsWith',
  'endsWith',
  'indexOf',
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'addEventListener',
  'removeEventListener',
  'getItem',
  'setItem',
  'removeItem',
  'deleteItemAsync',
  'getItemAsync',
  'setItemAsync',
  'log',
  'warn',
  'error',
  'info',
  'debug',
]);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function validateAllowlist(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('Allowlist must be a JSON array.');
  }
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Allowlist entry #${i + 1} must be an object.`);
    }
    if (typeof entry.file !== 'string' || !entry.file.trim()) {
      throw new Error(`Allowlist entry #${i + 1} is missing a non-empty "file".`);
    }
    if (typeof entry.rule !== 'string' || !VALID_RULES.has(entry.rule)) {
      throw new Error(
        `Allowlist entry #${i + 1} has invalid "rule": ${String(entry.rule)}.`
      );
    }
    if (typeof entry.match !== 'string' || !entry.match.trim()) {
      throw new Error(`Allowlist entry #${i + 1} is missing a non-empty "match".`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
      throw new Error(
        `Allowlist entry #${i + 1} (${entry.file}) must include a descriptive "reason" (at least 10 chars).`
      );
    }
  }
  return entries;
}

function isInsideTypeOrImport(node) {
  let cur = node.parent;
  while (cur) {
    if (
      ts.isTypeNode(cur) ||
      ts.isInterfaceDeclaration(cur) ||
      ts.isTypeAliasDeclaration(cur) ||
      ts.isImportDeclaration(cur) ||
      ts.isExportDeclaration(cur) ||
      ts.isImportEqualsDeclaration(cur)
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

function getJsxTagName(jsxOpeningLike, sf) {
  if (!jsxOpeningLike || !jsxOpeningLike.tagName) return '';
  return jsxOpeningLike.tagName.getText(sf);
}

function isIntrinsicDomTag(tagName) {
  return Boolean(tagName) && tagName[0] === tagName[0].toLowerCase();
}

function isTechnicalStringContext(node, sf) {
  if (isInsideTypeOrImport(node)) return true;

  const parent = node.parent;
  if (!parent) return false;

  // Object key or element access key: { 'USD/PHP': 1 } or obj['code']
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
    return true;
  }

  // JSX attribute checks
  let attrNode = null;
  if (ts.isJsxAttribute(parent)) attrNode = parent;
  else if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
    attrNode = parent.parent;
  }
  if (attrNode) {
    const attrName = attrNode.name.getText(sf);
    if (TECHNICAL_JSX_ATTRS.has(attrName) || attrName.startsWith('data-')) {
      return true;
    }
    // Native HTML `title` tooltip attribute (e.g. <span title={t.id}> per Spec 7B.12)
    if (attrName === 'title') {
      const opening = attrNode.parent?.parent;
      const tag = getJsxTagName(opening, sf);
      if (isIntrinsicDomTag(tag)) return true;
    }
  }

  // Direct equality comparisons (`status === 'completed'`, `'code' in error`) or switch case
  if (ts.isCaseClause(parent) && parent.expression === node) return true;
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    if (
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken ||
      op === ts.SyntaxKind.InKeyword
    ) {
      return true;
    }
  }

  // Technical function / method calls (queries, routing, console, regex, storage)
  if (ts.isCallExpression(parent) && parent.arguments.includes(node)) {
    const callee = parent.expression;
    if (ts.isIdentifier(callee)) {
      if (
        callee.text === 'require' ||
        callee.text === 'RegExp' ||
        callee.text === 'redirect' ||
        callee.text === 'revalidatePath'
      ) {
        return true;
      }
    } else if (ts.isPropertyAccessExpression(callee)) {
      const objText = callee.expression.getText(sf);
      const method = callee.name.text;
      if (TECHNICAL_METHODS.has(method) || objText === 'console') {
        return true;
      }
    }
  }
  if (ts.isNewExpression(parent) && ts.isIdentifier(parent.expression)) {
    if (parent.expression.text === 'RegExp') return true;
  }

  // Next.js route matcher regexes: config = { matcher: ['/((?!_next...)'] }
  let cur = parent;
  while (cur) {
    if (ts.isPropertyAssignment(cur) && cur.name.getText(sf) === 'matcher') {
      return true;
    }
    cur = cur.parent;
  }

  return false;
}

function isSentenceCaseInitialCall(callNode) {
  // Allow `<expr>.charAt(0).toUpperCase()` / `<expr>.charAt(0).toLocaleUpperCase()`
  const target = callNode.expression.expression;
  if (
    ts.isCallExpression(target) &&
    ts.isPropertyAccessExpression(target.expression) &&
    target.expression.name.text === 'charAt' &&
    target.arguments.length === 1 &&
    ts.isNumericLiteral(target.arguments[0]) &&
    target.arguments[0].text === '0'
  ) {
    return true;
  }
  return false;
}

function isPureComparisonUppercase(callNode) {
  const parent = callNode.parent;
  if (!parent) return false;
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    return (
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken
    );
  }
  if (ts.isPropertyAccessExpression(parent)) {
    const m = parent.name.text;
    return m === 'includes' || m === 'startsWith' || m === 'endsWith';
  }
  return false;
}

function isFormatterCall(expr) {
  if (!ts.isCallExpression(expr)) return false;
  if (ts.isIdentifier(expr.expression)) {
    return FORMATTER_CALLS.has(expr.expression.text);
  }
  if (ts.isPropertyAccessExpression(expr.expression)) {
    return FORMATTER_CALLS.has(expr.expression.name.text);
  }
  return false;
}

function unwrapStringSliceOrParens(expr) {
  let cur = expr;
  while (cur) {
    if (ts.isParenthesizedExpression(cur) || ts.isNonNullExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
      const m = cur.expression.name.text;
      if (m === 'slice' || m === 'substring' || m === 'trim' || m === 'toString') {
        cur = cur.expression.expression;
        continue;
      }
    }
    break;
  }
  return cur;
}

function containsUnformattedUuidExpr(expr) {
  if (!expr) return false;
  if (isFormatterCall(expr)) return false;

  if (ts.isParenthesizedExpression(expr) || ts.isNonNullExpression(expr)) {
    return containsUnformattedUuidExpr(expr.expression);
  }

  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return (
        containsUnformattedUuidExpr(expr.left) ||
        containsUnformattedUuidExpr(expr.right)
      );
    }
    return false;
  }

  if (ts.isConditionalExpression(expr)) {
    return (
      containsUnformattedUuidExpr(expr.whenTrue) ||
      containsUnformattedUuidExpr(expr.whenFalse)
    );
  }

  const target = unwrapStringSliceOrParens(expr);
  if (isFormatterCall(target)) return false;

  if (ts.isPropertyAccessExpression(target)) {
    return UUID_PROPERTIES.has(target.name.text);
  }
  if (ts.isIdentifier(target)) {
    return STANDALONE_UUID_VARS.has(target.text);
  }
  return false;
}

function isCsvOrFileUriTemplate(tplNode, sf) {
  const full = tplNode.getText(sf);
  // Quoted CSV cell `"${tx.transaction_id}"` or file cache URI `${FileSystem.cacheDirectory}...`
  if (/^`"\$\{[^}]+\}"`$/.test(full)) return true;
  if (full.includes('cacheDirectory') || full.includes('documentDirectory')) {
    return true;
  }
  return false;
}

function compactSnippet(raw) {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}

export function scanSource(sourceText, filePath, options = {}) {
  const normalizedFile = toPosixPath(filePath);
  const allowlist = options.allowlist || [];
  const usedEntries = new Set();
  const violations = [];
  let allowlistedCount = 0;

  const isTsx = normalizedFile.endsWith('.tsx') || normalizedFile.endsWith('.jsx');
  const sf = ts.createSourceFile(
    normalizedFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  function record(node, rule, message, snippetOverride) {
    const snippet = compactSnippet(snippetOverride ?? node.getText(sf));
    const matchIndex = allowlist.findIndex(
      (entry) =>
        toPosixPath(entry.file) === normalizedFile &&
        entry.rule === rule &&
        snippet.includes(entry.match)
    );
    if (matchIndex !== -1) {
      usedEntries.add(matchIndex);
      allowlistedCount++;
      return;
    }
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    violations.push({
      file: normalizedFile,
      line: line + 1,
      column: character + 1,
      rule,
      message,
      snippet,
    });
  }

  function checkCopyText(node, text, snippetSource) {
    if (!text) return;

    if (text.includes('PHP ')) {
      record(
        node,
        'php-currency',
        "Use '₱' instead of 'PHP ' in user-facing copy",
        snippetSource
      );
    }

    const withoutDoctype = text
      .replace(/<!DOCTYPE\s+html>/gi, '')
      .replace(/!important\b/gi, '');
    if (withoutDoctype.includes('!')) {
      record(
        node,
        'exclamation-mark',
        'Avoid exclamation marks in user-facing copy',
        snippetSource
      );
    }

    if (UUID_LITERAL_RE.test(text)) {
      record(
        node,
        'raw-uuid',
        'Raw UUID literal in user-facing copy (use formatReferenceId)',
        snippetSource
      );
    }
  }

  function visit(node) {
    // Rule 1: .toUpperCase() / .toLocaleUpperCase() applied to UI copy
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === 'toUpperCase' ||
        node.expression.name.text === 'toLocaleUpperCase')
    ) {
      if (!isSentenceCaseInitialCall(node) && !isPureComparisonUppercase(node)) {
        record(
          node,
          'uppercase-copy',
          `Avoid .${node.expression.name.text}() on UI copy; use sentence case`
        );
      }
    }

    // Rule 2, 3, 4a on JSX text
    if (ts.isJsxText(node)) {
      const trimmed = node.text.trim();
      if (trimmed) {
        const parentOpening = ts.isJsxElement(node.parent)
          ? node.parent.openingElement
          : null;
        const tag = getJsxTagName(parentOpening, sf);
        if (tag !== 'style' && tag !== 'script') {
          checkCopyText(node, node.text, trimmed);
        }
      }
    }

    // Rule 2, 3, 4a on string / no-substitution template literals
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isTechnicalStringContext(node, sf)) {
        checkCopyText(node, node.text, node.getText(sf));
      }
    }

    // Rule 2, 3, 4a, 4b on template expressions
    if (ts.isTemplateExpression(node)) {
      if (!isTechnicalStringContext(node, sf)) {
        const fullTpl = node.getText(sf);
        checkCopyText(node.head, node.head.text, fullTpl);
        const skipUuidInTpl = isCsvOrFileUriTemplate(node, sf);
        for (const span of node.templateSpans) {
          checkCopyText(span.literal, span.literal.text, fullTpl);
          if (!skipUuidInTpl && containsUnformattedUuidExpr(span.expression)) {
            record(
              span.expression,
              'raw-uuid',
              'UUID interpolated without formatReferenceId',
              fullTpl
            );
          }
        }
      }
    }

    // Rule 4b on string concatenation: 'Ref: ' + tx.id
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const leftIsStr =
        ts.isStringLiteral(node.left) ||
        ts.isNoSubstitutionTemplateLiteral(node.left) ||
        ts.isTemplateExpression(node.left);
      const rightIsStr =
        ts.isStringLiteral(node.right) ||
        ts.isNoSubstitutionTemplateLiteral(node.right) ||
        ts.isTemplateExpression(node.right);
      if (leftIsStr && containsUnformattedUuidExpr(node.right)) {
        record(
          node.right,
          'raw-uuid',
          'UUID concatenated into string without formatReferenceId',
          node.getText(sf)
        );
      } else if (rightIsStr && containsUnformattedUuidExpr(node.left)) {
        record(
          node.left,
          'raw-uuid',
          'UUID concatenated into string without formatReferenceId',
          node.getText(sf)
        );
      }
    }

    // Rule 4b on JSX child expressions: <Text>{tx.transaction_id}</Text>
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      if (containsUnformattedUuidExpr(node.expression)) {
        record(
          node.expression,
          'raw-uuid',
          'UUID rendered in JSX without formatReferenceId'
        );
      }
    }

    // Rule 4b on user-facing JSX copy attributes: <Button title={tx.id} />
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression
    ) {
      const attrName = node.name.getText(sf);
      const opening = node.parent?.parent;
      const tag = getJsxTagName(opening, sf);
      const isDomTitleTooltip = attrName === 'title' && isIntrinsicDomTag(tag);
      if (COPY_JSX_ATTRS.has(attrName) && !isDomTitleTooltip) {
        if (containsUnformattedUuidExpr(node.initializer.expression)) {
          record(
            node.initializer.expression,
            'raw-uuid',
            `UUID passed to user-facing "${attrName}" prop without formatReferenceId`
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);

  return { violations, allowlistedCount, usedEntries };
}

function collectSourceFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      files.push(...collectSourceFiles(full));
    } else if (
      /\.(ts|tsx|js|jsx)$/.test(entry.name) &&
      !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(full);
    }
  }
  return files.sort();
}

export function scanWorkspace({
  rootDir = DEFAULT_ROOT,
  targetDirs = DEFAULT_TARGETS,
  allowlistPath = path.join(rootDir, DEFAULT_ALLOWLIST),
} = {}) {
  let allowlist = [];
  if (allowlistPath && fs.existsSync(allowlistPath)) {
    const parsed = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
    allowlist = validateAllowlist(parsed);
  }

  const allViolations = [];
  const usedAllowlistIndices = new Set();
  let allowlistedCount = 0;
  let filesScanned = 0;

  for (const relTarget of targetDirs) {
    const absTarget = path.resolve(rootDir, relTarget);
    const files = collectSourceFiles(absTarget);
    for (const absFile of files) {
      filesScanned++;
      const relFile = toPosixPath(path.relative(rootDir, absFile));
      const content = fs.readFileSync(absFile, 'utf8');
      const { violations, allowlistedCount: count, usedEntries } = scanSource(
        content,
        relFile,
        { allowlist }
      );
      allViolations.push(...violations);
      allowlistedCount += count;
      for (const idx of usedEntries) usedAllowlistIndices.add(idx);
    }
  }

  const unusedAllowlistEntries = allowlist.filter(
    (_, idx) => !usedAllowlistIndices.has(idx)
  );

  return {
    filesScanned,
    violations: allViolations,
    allowlistedCount,
    unusedAllowlistEntries,
  };
}

function parseCliArgs(argv) {
  let rootDir = DEFAULT_ROOT;
  let allowlistPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) {
      rootDir = path.resolve(argv[++i]);
    } else if (argv[i] === '--allowlist' && argv[i + 1]) {
      allowlistPath = path.resolve(argv[++i]);
    }
  }
  return {
    rootDir,
    allowlistPath: allowlistPath ?? path.join(rootDir, DEFAULT_ALLOWLIST),
  };
}

export function runCli(argv = process.argv.slice(2)) {
  try {
    const { rootDir, allowlistPath } = parseCliArgs(argv);
    const result = scanWorkspace({ rootDir, allowlistPath });

    for (const v of result.violations) {
      process.stdout.write(
        `FAIL ${v.file}:${v.line}:${v.column} [${v.rule}] ${v.message} — ${v.snippet}\n`
      );
    }

    if (result.violations.length > 0) {
      process.stdout.write(
        `\nCopy audit failed: ${result.violations.length} violation(s) across ${result.filesScanned} files (${result.allowlistedCount} justified allowlist match(es)).\n`
      );
      return 1;
    }

    process.stdout.write(
      `PASS Copy audit clean across ${result.filesScanned} files (${result.allowlistedCount} justified allowlist match(es)).\n`
    );
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Copy audit error: ${message}\n`);
    return 1;
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  process.exitCode = runCli();
}
