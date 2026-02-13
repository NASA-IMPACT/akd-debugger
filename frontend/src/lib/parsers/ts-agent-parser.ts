import { parse } from "@babel/parser";
import type { Node, ObjectExpression, ObjectProperty, Expression, VariableDeclarator, Statement, Declaration } from "@babel/types";

/**
 * Parse TypeScript agent code and extract agent configuration.
 * Looks for `new Agent({...})` and resolves tools/variable references.
 */
export function parseTypescriptAgentCode(code: string): Record<string, unknown> {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "decorators-legacy"],
    errorRecovery: true,
  });

  const result: Record<string, unknown> = {};

  // Collect all top-level variable declarations for reference resolution
  const varDecls = new Map<string, VariableDeclarator>();
  for (const node of ast.program.body) {
    collectVarDecls(node, varDecls);
  }

  // Walk AST to find `new Agent({...})`
  walkNode(ast.program, (node) => {
    if (
      node.type === "NewExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "Agent" &&
      node.arguments.length > 0 &&
      node.arguments[0].type === "ObjectExpression"
    ) {
      const obj = node.arguments[0] as ObjectExpression;
      extractAgentProps(obj, varDecls, result);
    }
  });

  return result;
}

/** Recursively collect variable declarations from statements. */
function collectVarDecls(node: Statement | Declaration, map: Map<string, VariableDeclarator>) {
  if (node.type === "VariableDeclaration") {
    for (const decl of node.declarations) {
      if (decl.id.type === "Identifier") {
        map.set(decl.id.name, decl);
      }
    }
  } else if (node.type === "ExportNamedDeclaration" && node.declaration) {
    collectVarDecls(node.declaration, map);
  }
}

/** Extract agent properties from the ObjectExpression argument of `new Agent({...})`. */
function extractAgentProps(
  obj: ObjectExpression,
  varDecls: Map<string, VariableDeclarator>,
  result: Record<string, unknown>,
) {
  for (const prop of obj.properties) {
    if (prop.type !== "ObjectProperty") continue;
    const p = prop as ObjectProperty;
    const key = getPropertyKey(p);
    if (!key) continue;

    if (key === "name") {
      const val = evalNode(p.value, varDecls);
      if (val !== undefined) result.name = val;
    } else if (key === "model") {
      const val = evalNode(p.value, varDecls);
      if (val !== undefined) result.model = val;
    } else if (key === "instructions") {
      const val = evalNode(p.value, varDecls);
      if (val !== undefined) result.system_prompt = val;
    } else if (key === "modelSettings") {
      const val = evalNode(p.value, varDecls);
      if (val !== undefined) result.model_settings = val;
    } else if (key === "tools") {
      const val = resolveTools(p.value, varDecls);
      if (val !== undefined && (Array.isArray(val) ? val.length > 0 : true)) {
        result.tools_config = val;
      }
    }
  }
}

/** Get the string key from an ObjectProperty. */
function getPropertyKey(prop: ObjectProperty): string | null {
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "StringLiteral") return prop.key.value;
  return null;
}

/**
 * Evaluate an AST node to a JS literal value.
 * Handles strings, numbers, booleans, null, objects, arrays, template literals,
 * and variable references.
 */
function evalNode(node: Node, varDecls: Map<string, VariableDeclarator>): unknown {
  switch (node.type) {
    case "StringLiteral":
      return node.value;
    case "NumericLiteral":
      return node.value;
    case "BooleanLiteral":
      return node.value;
    case "NullLiteral":
      return null;
    case "TemplateLiteral":
      // Only handle template literals with no expressions (plain strings)
      if (node.expressions.length === 0 && node.quasis.length === 1) {
        return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
      }
      // For complex template literals, concatenate what we can
      return node.quasis.map((q) => q.value.cooked ?? q.value.raw).join("${...}");
    case "UnaryExpression":
      if (node.operator === "-" && node.argument.type === "NumericLiteral") {
        return -node.argument.value;
      }
      return undefined;
    case "ObjectExpression": {
      const obj: Record<string, unknown> = {};
      for (const prop of node.properties) {
        if (prop.type === "ObjectProperty") {
          const key = getPropertyKey(prop as ObjectProperty);
          if (key) {
            const val = evalNode((prop as ObjectProperty).value, varDecls);
            if (val !== undefined) obj[key] = val;
          }
        } else if (prop.type === "SpreadElement") {
          const spreadVal = evalNode(prop.argument, varDecls);
          if (spreadVal && typeof spreadVal === "object" && !Array.isArray(spreadVal)) {
            Object.assign(obj, spreadVal);
          }
        }
      }
      return obj;
    }
    case "ArrayExpression": {
      const arr: unknown[] = [];
      for (const el of node.elements) {
        if (el === null) {
          arr.push(null);
        } else if (el.type === "SpreadElement") {
          const spreadVal = evalNode(el.argument, varDecls);
          if (Array.isArray(spreadVal)) arr.push(...spreadVal);
        } else {
          const val = evalNode(el, varDecls);
          if (val !== undefined) arr.push(val);
        }
      }
      return arr;
    }
    case "Identifier": {
      // Resolve variable reference
      const decl = varDecls.get(node.name);
      if (decl?.init) {
        return evalNode(decl.init, varDecls);
      }
      return undefined;
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
      // Unwrap TypeScript type assertions: `x as Type` or `x satisfies Type`
      return evalNode(node.expression, varDecls);
    default:
      return undefined;
  }
}

/**
 * Resolve the `tools` array.
 * Each element can be:
 *  - An identifier referencing a variable (e.g. `webSearchPreview`)
 *  - A call expression (e.g. `webSearchTool({...})`)
 *  - A `new` expression (e.g. `new HostedMCPTool({...})`)
 *
 * We resolve each to an object describing the tool.
 */
function resolveTools(node: Node, varDecls: Map<string, VariableDeclarator>): unknown[] | undefined {
  if (node.type !== "ArrayExpression") return undefined;

  const tools: unknown[] = [];

  for (const el of node.elements) {
    if (!el || el.type === "SpreadElement") continue;

    const resolved = resolveToolElement(el, varDecls);
    if (resolved !== undefined) {
      tools.push(resolved);
    }
  }

  return tools;
}

/**
 * Resolve a single tool element from the tools array.
 */
function resolveToolElement(node: Expression, varDecls: Map<string, VariableDeclarator>): unknown {
  // If it's a variable reference, resolve it first
  if (node.type === "Identifier") {
    const decl = varDecls.get(node.name);
    if (decl?.init) {
      return resolveToolElement(decl.init as Expression, varDecls);
    }
    // Unresolvable variable — return the name as a hint
    return { type: "unknown", name: node.name };
  }

  // Call expression: webSearchTool({...}), computerTool({...}), etc.
  if (node.type === "CallExpression") {
    return resolveCallExpr(node, varDecls);
  }

  // New expression: new HostedMCPTool({...})
  if (node.type === "NewExpression") {
    return resolveNewExpr(node, varDecls);
  }

  return undefined;
}

function resolveCallExpr(node: Extract<Node, { type: "CallExpression" }>, varDecls: Map<string, VariableDeclarator>): unknown {
  const calleeName = getCalleeName(node.callee);
  const config: Record<string, unknown> = {};

  if (calleeName) config.type = calleeName;

  // Extract first object argument as config
  if (node.arguments.length > 0 && node.arguments[0].type === "ObjectExpression") {
    const objVal = evalNode(node.arguments[0], varDecls);
    if (objVal && typeof objVal === "object" && !Array.isArray(objVal)) {
      Object.assign(config, objVal as Record<string, unknown>);
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function resolveNewExpr(node: Extract<Node, { type: "NewExpression" }>, varDecls: Map<string, VariableDeclarator>): unknown {
  const calleeName = node.callee.type === "Identifier" ? node.callee.name : null;
  const config: Record<string, unknown> = {};

  if (calleeName) config.type = calleeName;

  // Extract first object argument
  if (node.arguments.length > 0 && node.arguments[0].type === "ObjectExpression") {
    const objVal = evalNode(node.arguments[0], varDecls);
    if (objVal && typeof objVal === "object" && !Array.isArray(objVal)) {
      Object.assign(config, objVal as Record<string, unknown>);
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function getCalleeName(node: Node): string | null {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && node.property.type === "Identifier") {
    return node.property.name;
  }
  return null;
}

/**
 * Walk all nodes in an AST subtree, calling `visitor` on each.
 */
function walkNode(node: Node, visitor: (n: Node) => void) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
    const child = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && (item as Node).type) {
          walkNode(item as Node, visitor);
        }
      }
    } else if (child && typeof child === "object" && (child as Node).type) {
      walkNode(child as Node, visitor);
    }
  }
}
