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
  const hookPattern =
    /use(Query|Mutation|Action)\s*\(\s*api\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/gs;
  for (const match of source.matchAll(hookPattern)) {
    const [, hook, moduleName, functionName] = match;
    const key = `${moduleName}.${functionName}`;
    const expectedKind = hookToKind[hook];
    const reference = references.get(key) ?? {
      moduleName,
      functionName,
      expectedKinds: new Set(),
      files: new Set(),
    };
    reference.expectedKinds.add(expectedKind);
    reference.files.add(relative(file));
    references.set(key, reference);
  }
}

const errors = [];

for (const reference of [...references.values()].sort((left, right) =>
  `${left.moduleName}.${left.functionName}`.localeCompare(
    `${right.moduleName}.${right.functionName}`,
  ),
)) {
  if (reference.expectedKinds.size > 1) {
    errors.push(
      `api.${reference.moduleName}.${reference.functionName} is used with multiple hook kinds: ${[
        ...reference.expectedKinds,
      ].join(", ")}`,
    );
    continue;
  }

  const moduleFile = join(root, "convex", `${reference.moduleName}.ts`);
  if (!existsSync(moduleFile)) {
    errors.push(
      `Missing Convex module for api.${reference.moduleName}.${reference.functionName}: ${relative(moduleFile)}`,
    );
    continue;
  }

  const moduleSource = readFileSync(moduleFile, "utf8");
  const exportPattern = new RegExp(
    `export\\s+const\\s+${escapeRegExp(reference.functionName)}\\s*=\\s*(query|mutation|action)\\s*\\(`,
    "m",
  );
  const exportMatch = moduleSource.match(exportPattern);
  if (!exportMatch) {
    errors.push(
      `Missing public Convex export api.${reference.moduleName}.${reference.functionName} used by ${[
        ...reference.files,
      ].join(", ")}`,
    );
    continue;
  }

  const expectedKind = [...reference.expectedKinds][0];
  const actualKind = exportMatch[1];
  if (actualKind !== expectedKind) {
    errors.push(
      `api.${reference.moduleName}.${reference.functionName} is used as ${expectedKind} but exported as ${actualKind}`,
    );
  }
}

const convexRoot = join(root, "convex");
const nestedFunctionPattern =
  /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(query|mutation|action|internalQuery|internalMutation|internalAction)\s*\(/g;

for (const file of findFiles(convexRoot, /\.ts$/)) {
  const modulePath = file.slice(convexRoot.length + 1).replaceAll("\\", "/");
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

console.log(
  `Convex public contract OK (${references.size} frontend references).`,
);

function findFiles(directory, pattern) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
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
