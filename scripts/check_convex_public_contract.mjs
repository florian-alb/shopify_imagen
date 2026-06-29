import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const appFiles = findFiles(join(root, "app"), /\.(ts|tsx)$/);

const hookToKind = {
  Query: "query",
  Mutation: "mutation",
  Action: "action",
};

const references = new Map();

for (const file of appFiles) {
  const source = readFileSync(file, "utf8");
  const hookPattern = /use(Query|Mutation|Action)\s*\(\s*api\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/gs;
  for (const match of source.matchAll(hookPattern)) {
    const [, hook, moduleName, functionName] = match;
    const key = `${moduleName}.${functionName}`;
    const expectedKind = hookToKind[hook];
    const ref = references.get(key) ?? {
      moduleName,
      functionName,
      expectedKinds: new Set(),
      files: new Set(),
    };
    ref.expectedKinds.add(expectedKind);
    ref.files.add(relative(file));
    references.set(key, ref);
  }
}

const errors = [];

for (const ref of [...references.values()].sort((a, b) =>
  `${a.moduleName}.${a.functionName}`.localeCompare(`${b.moduleName}.${b.functionName}`),
)) {
  if (ref.expectedKinds.size > 1) {
    errors.push(
      `api.${ref.moduleName}.${ref.functionName} is used with multiple hook kinds: ${[
        ...ref.expectedKinds,
      ].join(", ")}`,
    );
    continue;
  }

  const moduleFile = join(root, "convex", `${ref.moduleName}.ts`);
  if (!existsSync(moduleFile)) {
    errors.push(`Missing Convex module for api.${ref.moduleName}.${ref.functionName}: ${relative(moduleFile)}`);
    continue;
  }

  const moduleSource = readFileSync(moduleFile, "utf8");
  const exportPattern = new RegExp(
    `export\\s+const\\s+${escapeRegExp(ref.functionName)}\\s*=\\s*(query|mutation|action)\\s*\\(`,
    "m",
  );
  const exportMatch = moduleSource.match(exportPattern);
  if (!exportMatch) {
    errors.push(
      `Missing public Convex export api.${ref.moduleName}.${ref.functionName} used by ${[
        ...ref.files,
      ].join(", ")}`,
    );
    continue;
  }

  const expectedKind = [...ref.expectedKinds][0];
  const actualKind = exportMatch[1];
  if (actualKind !== expectedKind) {
    errors.push(
      `api.${ref.moduleName}.${ref.functionName} is used as ${expectedKind} but exported as ${actualKind}`,
    );
  }
}

const convexRoot = join(root, "convex");
const nestedFunctionPattern =
  /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(query|mutation|action|internalQuery|internalMutation|internalAction)\s*\(/g;

for (const file of findFiles(convexRoot, /\.ts$/)) {
  const modulePath = file
    .slice(convexRoot.length + 1)
    .replaceAll("\\", "/");
  if (!modulePath.includes("/") || modulePath.startsWith("_generated/")) {
    continue;
  }

  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(nestedFunctionPattern)) {
    const [, functionName, kind] = match;
    errors.push(
      `Nested Convex module ${relative(file)} exports ${kind} ${functionName}; keep public/internal functions in root facade modules unless deliberately migrating the API.`,
    );
  }
}

if (errors.length) {
  console.error("Convex public contract check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Convex public contract OK (${references.size} frontend references).`);

function findFiles(dir, pattern) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) files.push(...findFiles(fullPath, pattern));
    else if (pattern.test(fullPath)) files.push(fullPath);
  }
  return files;
}

function relative(file) {
  return file.replace(`${root}/`, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
