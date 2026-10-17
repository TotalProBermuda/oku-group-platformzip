import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { Storage } from "@google-cloud/storage";

const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
const { getRootDirs } = pluginRequire("./utils/get-root-dirs.js");
const fixtures: string[] = [];
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

describe("release dependency compatibility", () => {
  it("keeps committed tarball URLs portable through the public HTTPS npm registry", () => {
    const lock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8")) as {
      packages: Record<string, { resolved?: string }>;
    };
    const tarballs = Object.entries(lock.packages).filter(([, pkg]) => pkg.resolved);
    expect(tarballs.length).toBeGreaterThan(0);
    for (const [packagePath, pkg] of tarballs) {
      const url = new URL(pkg.resolved!);
      expect(url.protocol, packagePath).toBe("https:");
      expect(url.hostname, packagePath).toBe("registry.npmjs.org");
      expect(url.username, packagePath).toBe("");
      expect(url.password, packagePath).toBe("");
    }
  });

  it("replaces the vulnerable implementation, not just its package name", () => {
    const replacement = pluginRequire("fast-glob/package.json");
    expect(replacement.name).toBe("tinyglobby");
    expect(replacement.version).toBe("0.2.17");
    expect(typeof pluginRequire("fast-glob").globSync).toBe("function");
  });

  it("preserves Next lint root globbing: braces, arrays, directories only and Windows separators", () => {
    const root = mkdtempSync(join(tmpdir(), "oku-lint-glob-"));
    fixtures.push(root);
    const directories = [join(root, "apps/restaurant"), join(root, "packages/events")];
    directories.forEach((path) => mkdirSync(path, { recursive: true }));
    writeFileSync(join(root, "apps/not-a-directory"), "fixture");
    const context = (rootDir: unknown) => ({ cwd: root, settings: { next: { rootDir } } });
    // Next passes these paths through path.join + fs, supporting relative roots.
    // tinyglobby returns relative directory paths with trailing separators;
    // compare their filesystem meaning, not that incidental representation.
    const roots = (rootDir: unknown) => getRootDirs(context(rootDir)).map((path: string) => resolve(path)).sort();
    expect(roots(join(root, "{apps,packages}/*"))).toEqual(directories.sort());
    expect(roots([join(root, "apps/*"), join(root, "packages/*"), 42])).toEqual(directories.sort());
    expect(roots(join(root, "apps/*").replaceAll("/", "\\"))).toEqual([directories[0]]);
    expect(getRootDirs(context(undefined))).toEqual([root]);
  });

  it("loads the unchanged Next, TypeScript, React, accessibility and import lint rules", async () => {
    const { ESLint } = require("eslint");
    const eslint = new ESLint({ cwd: process.cwd() });
    const config = await eslint.calculateConfigForFile("src/lib/auth.ts");
    for (const plugin of ["@next/next", "@typescript-eslint", "react", "jsx-a11y", "import"]) {
      expect(config.plugins).toContain(plugin);
    }
    expect(config.rules["@next/next/no-html-link-for-pages"]).toBeDefined();
  }, 20_000);

  it("still enforces the actual Next link rule against pages discovered through the replacement", async () => {
    const root = mkdtempSync(join(tmpdir(), "oku-next-lint-"));
    fixtures.push(root);
    const pages = join(root, "apps/restaurant/pages");
    mkdirSync(pages, { recursive: true });
    writeFileSync(join(pages, "about.js"), "export default function About() { return null; }");
    const { ESLint } = require("eslint");
    const eslint = new ESLint({
      useEslintrc: false,
      baseConfig: {
        parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
        plugins: ["@next/next"],
        settings: { next: { rootDir: join(root, "apps/*") } },
        rules: { "@next/next/no-html-link-for-pages": "error" },
      },
    });
    const [result] = await eslint.lintText('export default function Page() { return <a href="/about">About</a>; }');
    expect(result.messages.some((message: { ruleId: string }) => message.ruleId === "@next/next/no-html-link-for-pages")).toBe(true);
    expect(result.fatalErrorCount).toBe(0);
  }, 20_000);

  it.each(["gaxios", "teeny-request"])("%s resolves the patched CommonJS UUID with a compatible v4 API", (consumer) => {
    const local = createRequire(require.resolve(consumer));
    expect(local("uuid/package.json").version).toBe("11.1.1");
    const { v4, validate, version } = local("uuid");
    const id = v4();
    expect(validate(id)).toBe(true);
    expect(version(id)).toBe(4);
  });

  it("uploads generic multipart content through the actual Storage SDK without authentication or external access", async () => {
    let uploadPath = "";
    let body = "";
    const server = createServer((request, response) => {
      uploadPath = request.url || "";
      request.on("data", (chunk) => { body += chunk.toString(); });
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ name: "fixture.txt", bucket: "release-fixture", generation: "1", size: "11" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a local test port");
      const storage = new Storage({
        apiEndpoint: `http://127.0.0.1:${address.port}`,
        projectId: "release-fixture",
        useAuthWithCustomEndpoint: false,
        retryOptions: { autoRetry: false },
      });
      await storage.bucket("release-fixture").file("fixture.txt").save("Hello world", {
        resumable: false,
        validation: false,
      });
      expect(uploadPath).toContain("/upload/storage/v1/b/release-fixture/o");
      expect(body).toContain("Hello world");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
