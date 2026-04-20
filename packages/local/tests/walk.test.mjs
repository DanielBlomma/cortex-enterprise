import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { walkProjectFiles } = await import("../dist/tools/walk.js");

function makeTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cortex-walk-"));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function write(root, rel, content = "x") {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

test("walkProjectFiles returns relative text-file paths sorted none (order stable per FS)", () => {
  const root = makeTmpProject();
  try {
    write(root, "src/app.ts", "const x = 1;");
    write(root, "src/util.py", "def f(): pass");
    write(root, "README.md", "# hi");

    const files = walkProjectFiles(root);
    assert.ok(files.includes("src/app.ts"));
    assert.ok(files.includes("src/util.py"));
    assert.ok(files.includes("README.md"));
  } finally {
    cleanup(root);
  }
});

test("walkProjectFiles skips excluded dirs (node_modules, .git, dist)", () => {
  const root = makeTmpProject();
  try {
    write(root, "src/app.ts");
    write(root, "node_modules/pkg/index.js");
    write(root, ".git/HEAD");
    write(root, "dist/bundle.js");
    write(root, ".venv/lib/module.py");
    write(root, "coverage/lcov.info");

    const files = walkProjectFiles(root);
    assert.ok(files.includes("src/app.ts"));
    assert.ok(!files.some((f) => f.startsWith("node_modules/")));
    assert.ok(!files.some((f) => f.startsWith(".git/")));
    assert.ok(!files.some((f) => f.startsWith("dist/")));
    assert.ok(!files.some((f) => f.startsWith(".venv/")));
    assert.ok(!files.some((f) => f.startsWith("coverage/")));
  } finally {
    cleanup(root);
  }
});

test("walkProjectFiles skips binary/unknown extensions", () => {
  const root = makeTmpProject();
  try {
    write(root, "src/app.ts");
    write(root, "assets/logo.png", "\x89PNG");
    write(root, "assets/video.mp4");

    const files = walkProjectFiles(root);
    assert.ok(files.includes("src/app.ts"));
    assert.ok(!files.some((f) => f.endsWith(".png")));
    assert.ok(!files.some((f) => f.endsWith(".mp4")));
  } finally {
    cleanup(root);
  }
});

test("walkProjectFiles picks up .env.* and appsettings.* without matching by extension", () => {
  const root = makeTmpProject();
  try {
    write(root, ".env", "SECRET=abc");
    write(root, ".env.production", "SECRET=abc");
    write(root, "appsettings.Development.json", "{}");
    write(root, "src/appsettings.json", "{}");

    const files = walkProjectFiles(root);
    assert.ok(files.includes(".env"));
    assert.ok(files.includes(".env.production"));
    assert.ok(files.includes("appsettings.Development.json"));
    assert.ok(files.includes("src/appsettings.json"));
  } finally {
    cleanup(root);
  }
});

test("walkProjectFiles descends into nested subdirectories", () => {
  const root = makeTmpProject();
  try {
    write(root, "a/b/c/deep.ts");
    write(root, "a/b/d/deep2.py");

    const files = walkProjectFiles(root);
    assert.ok(files.includes("a/b/c/deep.ts"));
    assert.ok(files.includes("a/b/d/deep2.py"));
  } finally {
    cleanup(root);
  }
});

test("walkProjectFiles respects maxFiles cap", () => {
  const root = makeTmpProject();
  try {
    for (let i = 0; i < 20; i += 1) {
      write(root, `src/f${i}.ts`);
    }
    const files = walkProjectFiles(root, { maxFiles: 5 });
    assert.equal(files.length, 5);
  } finally {
    cleanup(root);
  }
});

test("walkProjectFiles returns empty array on non-existent root", () => {
  const files = walkProjectFiles("/tmp/this-does-not-exist-cortex-test");
  assert.deepEqual(files, []);
});
