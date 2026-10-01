import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import ts from "typescript";

const frontendRoot = resolve(process.cwd(), "packages/frontend");

function emittedImports(sourcePath: string) {
  const source = readFileSync(sourcePath, "utf8");
  const emitted = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const parsed = ts.createSourceFile(sourcePath.replace(/\.ts$/, ".js"), emitted, ts.ScriptTarget.ES2020, true);
  return parsed.statements
    .filter(ts.isImportDeclaration)
    .map(statement => (statement.moduleSpecifier as ts.StringLiteral).text);
}

describe("Vercel Node ESM function graph", () => {
  it.each(["mini-site", "sitemap"])("%s has no unresolved local runtime imports", entry => {
    const visited = new Set<string>();
    function inspect(sourcePath: string) {
      if (visited.has(sourcePath)) return;
      visited.add(sourcePath);
      for (const specifier of emittedImports(sourcePath)) {
        if (!specifier.startsWith(".")) continue;
        expect(specifier).toMatch(/\.js$/);
        const target = resolve(dirname(sourcePath), specifier.replace(/\.js$/, ".ts"));
        expect(target.startsWith(frontendRoot + sep)).toBe(true);
        expect(existsSync(target)).toBe(true);
        inspect(target);
      }
    }
    inspect(resolve(frontendRoot, "api", `${entry}.ts`));
    expect([...visited].every(path => path.startsWith(resolve(frontendRoot, "api") + sep))).toBe(true);
  });
});
