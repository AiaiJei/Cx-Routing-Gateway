const { parseTOML } = require("toml-eslint-parser");
const { parse } = require("smol-toml");
const { fail } = require("./codex-errors.cjs");
const isPrefix = (prefix, parts) => prefix.length <= parts.length && prefix.every((part, index) => part === parts[index]);
const keyParts = node => node.keys.map(key => key.type === "TOMLBare" ? key.name : key.value);
const keySource = parts => parts.map(part => JSON.stringify(part)).join(".");
const scalarSource = value => value && typeof value === "object" && typeof value.tomlRaw === "string" ? value.tomlRaw : typeof value === "boolean" ? String(value) : JSON.stringify(value);

// The AST supplies structural paths/ranges. Existing scalar source is never
// round-tripped through JS numbers or Date, so precision and TOML types survive.
function editCodexToml(source, { set, remove }) {
  let ast;
  try { ast = parseTOML(source, { tomlVersion: "1.0" }); }
  catch { throw fail("CODEX_CONFIG_UNSUPPORTED"); }
  const pending = set.map(([parts, value]) => ({ parts, value, handled: false }));
  const edits = [];
  const containers = [{ parts: [], position: 0 }];
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const removing = parts => remove.some(prefix => isPrefix(prefix, parts));
  const needsDescendants = parts => pending.some(item => !item.handled && isPrefix(parts, item.parts));
  const replacementAt = parts => pending.find(item => item.parts.length === parts.length && isPrefix(parts, item.parts));

  function renderInline(node, parts) {
    const pieces = [];
    let changed = false;
    for (const child of node.body) {
      const childParts = [...parts, ...keyParts(child.key)];
      const result = renderEntry(child, childParts);
      if (result === null) { changed = true; continue; }
      if (result !== source.slice(...child.range)) changed = true;
      pieces.push(result);
    }
    for (const item of pending) {
      if (!item.handled && isPrefix(parts, item.parts)) {
        pieces.push(keySource(item.parts.slice(parts.length)) + " = " + scalarSource(item.value));
        item.handled = true;
        changed = true;
      }
    }
    return changed ? "{ " + pieces.join(", ") + " }" : source.slice(...node.range);
  }

  function renderEntry(node, parts) {
    if (removing(parts)) return null;
    const replacement = replacementAt(parts);
    if (replacement) {
      replacement.handled = true;
      return source.slice(node.range[0], node.value.range[0]) + scalarSource(replacement.value);
    }
    const affectsChildren = needsDescendants(parts) || remove.some(prefix => isPrefix(parts, prefix));
    if (affectsChildren) {
      if (node.value.type !== "TOMLInlineTable") throw fail("CODEX_CONFIG_UNSUPPORTED");
      return source.slice(node.range[0], node.value.range[0]) + renderInline(node.value, parts);
    }
    return source.slice(...node.range);
  }

  for (const node of ast.body[0].body) {
    if (node.type === "TOMLKeyValue") {
      const rendered = renderEntry(node, keyParts(node.key));
      if (rendered !== source.slice(...node.range)) edits.push({ range: node.range, text: rendered || "" });
      continue;
    }
    const parts = node.resolvedKey;
    if (removing(parts)) { edits.push({ range: node.range, text: "" }); continue; }
    if (node.kind === "array" && (needsDescendants(parts.filter(part => typeof part === "string")) || remove.some(prefix => isPrefix(parts.filter(part => typeof part === "string"), prefix)))) throw fail("CODEX_CONFIG_UNSUPPORTED");
    if (replacementAt(parts)) throw fail("CODEX_CONFIG_UNSUPPORTED");
    // Use the deepest existing standard table for additions, avoiding redefining
    // implicit/dotted tables or reopening an already declared TOML table.
    if (node.kind === "standard" && parts.every(part => typeof part === "string")) {
      const firstLineEnd = source.indexOf("\n", node.key.range[1]);
      const position = firstLineEnd < 0 ? source.length : firstLineEnd + 1;
      containers.push({ parts, position });
    }
    for (const child of node.body) {
      const rendered = renderEntry(child, [...parts, ...keyParts(child.key)]);
      if (rendered !== source.slice(...child.range)) edits.push({ range: child.range, text: rendered || "" });
    }
  }

  const additions = new Map();
  for (const item of pending) {
    if (item.handled) continue;
    const owner = containers.filter(container => isPrefix(container.parts, item.parts)).sort((a, b) => b.parts.length - a.parts.length)[0];
    const lines = additions.get(owner.position) || [];
    lines.push(keySource(item.parts.slice(owner.parts.length)) + " = " + scalarSource(item.value));
    additions.set(owner.position, lines);
  }
  for (const [position, lines] of additions) {
    edits.push({ range: [position, position], text: (position > 0 && source[position - 1] !== "\n" ? newline : "") + lines.join(newline) + newline });
  }
  edits.sort((a, b) => b.range[0] - a.range[0] || b.range[1] - a.range[1]);
  let result = source;
  let previousStart = source.length + 1;
  for (const edit of edits) {
    if (edit.range[1] > previousStart) throw fail("CODEX_CONFIG_UNSUPPORTED");
    result = result.slice(0, edit.range[0]) + edit.text + result.slice(edit.range[1]);
    previousStart = edit.range[0];
  }
  // A structural edit that creates an invalid table declaration is refused before
  // any backup or file write. BigInt prevents rejecting valid 64-bit TOML ints.
  try { parse(result, { integersAsBigInt: true }); parseTOML(result, { tomlVersion: "1.0" }); }
  catch { throw fail("CODEX_CONFIG_UNSUPPORTED"); }
  return result;
}
module.exports = { editCodexToml };
