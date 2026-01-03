import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const searchPath = resolve(root, "api", "search-decision.ts");
const resolvePath = resolve(root, "api", "resolve-decision.ts");

const inline = `
  import searchHandler from ${JSON.stringify(pathToFileURL(searchPath).href)};
  import resolveHandler from ${JSON.stringify(pathToFileURL(resolvePath).href)};

  const createMockRes = () => {
    let body = "";
    const headers = new Map();
    const res = {
      statusCode: 200,
      setHeader: (name, value) => {
        headers.set(String(name).toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
      },
      end: (chunk) => {
        if (chunk) {
          body += typeof chunk === "string" ? chunk : String(chunk);
        }
      },
    };
    return {
      res,
      getBody: () => body,
      getHeaders: () => headers,
      getStatus: () => res.statusCode,
    };
  };

  const assertJsonResponse = (label, payload) => {
    if (!payload || typeof payload.ok !== "boolean") {
      throw new Error(label + ": missing ok");
    }
    if (typeof payload.trace_id !== "string") {
      throw new Error(label + ": missing trace_id");
    }
    if (typeof payload.ts !== "number") {
      throw new Error(label + ": missing ts");
    }
    if (payload.ok) {
      if (!("data" in payload)) {
        throw new Error(label + ": missing data on success");
      }
    } else {
      if (!payload.error || typeof payload.error.code !== "string" || typeof payload.error.message !== "string") {
        throw new Error(label + ": invalid error shape");
      }
      if (typeof payload.where !== "string") {
        throw new Error(label + ": missing where");
      }
    }
  };

  const run = async (label, handler) => {
    const req = { method: "POST", body: { query: "smoke_check" } };
    const mock = createMockRes();
    await handler(req, mock.res);
    const raw = mock.getBody();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(label + ": invalid JSON response");
    }
    assertJsonResponse(label, parsed);
    console.log(label + ": ok");
  };

  await run("search-decision", searchHandler);
  await run("resolve-decision", resolveHandler);
`;

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--input-type=module", "-e", inline],
  { encoding: "utf8" }
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
